// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "motronic175-state.h"
#include "motronic175-bridge-protocol.h"

#include <algorithm>
#include <cstdlib>
#include <limits>

[[noreturn]] void motronic175_state::bridge_fail(const std::string &message)
{
	std::string ignored;
	if (m_bridge_enabled)
		m_bridge_socket.write_line(
				motronic175_bridge_protocol::error_frame(message),
				ignored);
	fatalerror("Motronic bridge fatal: %s\n", message.c_str());
}

motronic_bridge_command motronic175_state::bridge_read_command()
{
	std::string line;
	std::string error;
	if (!m_bridge_socket.read_line(line, error))
		bridge_fail(error);
	motronic_bridge_command command;
	if (!motronic175_bridge_protocol::parse(line, command, error))
		bridge_fail(error);
	return command;
}

void motronic175_state::bridge_start(const char *path)
{
	u64 timeout_ms = 5'000;
	if (const char *text = std::getenv("MOTRONIC_BRIDGE_TIMEOUT_MS"))
	{
		char *end = nullptr;
		timeout_ms = std::strtoull(text, &end, 10);
		if (!end || end == text || *end || !timeout_ms || timeout_ms > 600'000)
			fatalerror("invalid MOTRONIC_BRIDGE_TIMEOUT_MS=%s\n", text);
	}
	std::string error;
	if (!m_bridge_socket.open(path, timeout_ms, error))
		fatalerror("%s\n", error.c_str());
	m_bridge_enabled = true;
	m_bridge_cycle = m_maincpu->total_cycles();
	logerror(
			"BRIDGE schema=%s socket=%s timeout_ms=%llu cycle=%llu\n",
			MOTRONIC_BRIDGE_SCHEMA,
			path,
			timeout_ms,
			m_bridge_cycle);

	const motronic_bridge_command hello = bridge_read_command();
	if (hello.kind != motronic_bridge_command_kind::HELLO)
		bridge_fail("first command must be hello");
	if (!m_bridge_socket.write_line(
			motronic175_bridge_protocol::ready(m_bridge_cycle),
			error))
		bridge_fail(error);
	bridge_wait_for_advance();
}

void motronic175_state::bridge_wait_for_advance()
{
	const motronic_bridge_command command = bridge_read_command();
	if (command.kind == motronic_bridge_command_kind::SHUTDOWN)
	{
		m_maincpu->suspend(SUSPEND_REASON_HALT, false);
		request_stop("bridge-shutdown");
		return;
	}
	std::string error;
	if (!motronic175_bridge_protocol::validate_advance(
			command,
			m_bridge_next_seq,
			m_bridge_cycle,
			error))
		bridge_fail(error);

	m_bridge_advance = command;
	++m_bridge_next_seq;
	m_bridge_event_index = 0;
	m_bridge_telemetry.clear();
	m_bridge_batch_active = true;
	bridge_apply_events_at(m_bridge_cycle);
	if (m_bridge_event_index < m_bridge_advance.events.size())
	{
		const u64 event_cycle =
				m_bridge_advance.events[m_bridge_event_index].cycle;
		m_bridge_event_timer->adjust(
				m_maincpu->cycles_to_attotime(event_cycle - m_bridge_cycle));
	}
	else
		m_bridge_event_timer->adjust(attotime::never);
	m_bridge_boundary_timer->adjust(m_maincpu->cycles_to_attotime(
			m_bridge_advance.to_cycle - m_bridge_cycle));
}

void motronic175_state::bridge_apply_events_at(u64 cycle)
{
	while (m_bridge_event_index < m_bridge_advance.events.size()
			&& m_bridge_advance.events[m_bridge_event_index].cycle == cycle)
	{
		bridge_apply_event(m_bridge_advance.events[m_bridge_event_index]);
		++m_bridge_event_index;
	}
}

void motronic175_state::bridge_apply_event(
		const motronic_bridge_event &event)
{
	switch (event.kind)
	{
	case motronic_bridge_event_kind::XDATA:
		m_xdata->set_input(event.address, event.value);
		break;
	case motronic_bridge_event_kind::ADC:
		if (!m_adc.set_dynamic(event.selector, event.value))
			bridge_fail("validated ADC event was rejected");
		break;
	case motronic_bridge_event_kind::PORT:
		m_xdata->set_port_input(event.selector, event.value);
		break;
	case motronic_bridge_event_kind::CC0:
		m_maincpu->set_input_line(
				SAB80C515_CC0_LINE,
				event.value ? ASSERT_LINE : CLEAR_LINE);
		break;
	}
	logerror(
			"BRIDGE_EVENT seq=%llu cycle=%llu kind=%u selector=%u "
			"address=%04x value=%02x\n",
			m_bridge_advance.seq,
			event.cycle,
			unsigned(event.kind),
			event.selector,
			event.address,
			event.value);
}

TIMER_CALLBACK_MEMBER(motronic175_state::bridge_event)
{
	const u64 target = m_bridge_advance.events[m_bridge_event_index].cycle;
	const u64 actual = m_maincpu->total_cycles();
	if (actual != target)
		logerror(
				"BRIDGE_TIMER kind=event target=%llu cpu_cycles=%llu\n",
				target,
				actual);
	bridge_apply_events_at(target);
	if (m_bridge_event_index < m_bridge_advance.events.size())
	{
		const u64 next = m_bridge_advance.events[m_bridge_event_index].cycle;
		m_bridge_event_timer->adjust(m_maincpu->cycles_to_attotime(next - target));
	}
}

TIMER_CALLBACK_MEMBER(motronic175_state::bridge_boundary)
{
	const u64 actual = m_maincpu->total_cycles();
	if (actual != m_bridge_advance.to_cycle)
		logerror(
				"BRIDGE_TIMER kind=boundary target=%llu cpu_cycles=%llu\n",
				m_bridge_advance.to_cycle,
				actual);
	if (m_bridge_event_index != m_bridge_advance.events.size())
		bridge_fail("advance ended before every event was applied");
	m_bridge_event_timer->adjust(attotime::never);
	m_bridge_batch_active = false;
	bridge_send_frame();
	m_bridge_cycle = m_bridge_advance.to_cycle;
	bridge_wait_for_advance();
}

void motronic175_state::bridge_record(
		motronic_bridge_telemetry_kind kind,
		u64 cycle,
		u16 address,
		u8 selector,
		u8 value)
{
	if (!m_bridge_enabled || !m_bridge_batch_active)
		return;
	if (m_bridge_telemetry.size() == MOTRONIC_BRIDGE_MAX_TELEMETRY)
		bridge_fail("bridge telemetry overflow");
	const u64 logical_cycle = std::clamp(
			cycle,
			m_bridge_advance.from_cycle,
			m_bridge_advance.to_cycle);
	if (logical_cycle != cycle)
	{
		logerror(
				"BRIDGE_TIMER kind=telemetry cpu_cycles=%llu logical_cycle=%llu\n",
				cycle,
				logical_cycle);
	}
	m_bridge_telemetry.push_back({
			logical_cycle,
			kind,
			address,
			selector,
			value
	});
}

void motronic175_state::xdata_output_w(offs_t offset, u8 data)
{
	bridge_record(
			motronic_bridge_telemetry_kind::XDATA_WRITE,
			m_maincpu->total_cycles(),
			u16(offset),
			0,
			data);
}

void motronic175_state::ccu_w(offs_t offset, u8 data)
{
	bridge_record(
			motronic_bridge_telemetry_kind::SFR_WRITE,
			m_maincpu->total_cycles(),
			u16(0xc0 + offset),
			0,
			data);
}
