// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "motronic175-state.h"

#include <cstdlib>

void motronic175_state::machine_start()
{
	std::string adc_error;
	if (!m_adc.configure(
			std::getenv("MOTRONIC_ADC_PROFILE"),
			std::getenv("MOTRONIC_ADC_FAULT_CHANNEL"),
			adc_error))
		fatalerror("%s\n", adc_error.c_str());

	if (const char *limit = std::getenv("MOTRONIC_INSTRUCTION_LIMIT"))
	{
		char *end = nullptr;
		m_instruction_limit = std::strtoull(limit, &end, 10);
		if (!end || *end || !m_instruction_limit)
			fatalerror("invalid MOTRONIC_INSTRUCTION_LIMIT=%s\n", limit);
	}
	if (const char *timeout = std::getenv("MOTRONIC_TIMEOUT_MS"))
	{
		char *end = nullptr;
		m_timeout_ms = std::strtoull(timeout, &end, 10);
		if (!end || *end || !m_timeout_ms)
			fatalerror("invalid MOTRONIC_TIMEOUT_MS=%s\n", timeout);
	}
	m_continue_foreground =
			std::getenv("MOTRONIC_CONTINUE_FOREGROUND") != nullptr;
	const char *bridge_path = std::getenv("MOTRONIC_BRIDGE_SOCKET");
	logerror(
			"ADCMODEL profile=%s callback_range=0..127 addat=callback*2\n",
			m_adc.profile_name());

	m_timeout = timer_alloc(FUNC(motronic175_state::timeout), this);
	if (!bridge_path)
		m_timeout->adjust(attotime::from_msec(m_timeout_ms));
	m_crank_timer = timer_alloc(FUNC(motronic175_state::crank_transition), this);
	if (const char *path = std::getenv("MOTRONIC_CRANK_TRACE"))
	{
		if (bridge_path)
			fatalerror(
					"MOTRONIC_CRANK_TRACE cannot be combined with bridge mode\n");
		m_crank_trace = load_motronic_crank_trace(path);
		m_crank_timer->adjust(
				m_maincpu->cycles_to_attotime(m_crank_trace.front().cycle));
	}
	if (bridge_path)
	{
		m_bridge_event_timer =
				timer_alloc(FUNC(motronic175_state::bridge_event), this);
		m_bridge_boundary_timer =
				timer_alloc(FUNC(motronic175_state::bridge_boundary), this);
	}
	save_item(NAME(m_crank_index));
	save_item(NAME(m_p1_last));
	save_item(NAME(m_p1_transitions));
	machine().add_notifier(
			MACHINE_NOTIFY_EXIT,
			machine_notify_delegate(&motronic175_state::report, this));
	if (bridge_path)
		bridge_start(bridge_path);
}

TIMER_CALLBACK_MEMBER(motronic175_state::crank_transition)
{
	const motronic_crank_transition &transition = m_crank_trace[m_crank_index++];
	m_maincpu->set_input_line(
			SAB80C515_CC0_LINE,
			transition.high ? ASSERT_LINE : CLEAR_LINE);
	if (m_crank_index < m_crank_trace.size())
	{
		const u64 delta =
				m_crank_trace[m_crank_index].cycle - transition.cycle;
		m_crank_timer->adjust(m_maincpu->cycles_to_attotime(delta));
	}
}

void motronic175_state::p1_w(u8 data)
{
	if (data != m_p1_last)
	{
		++m_p1_transitions;
		logerror(
				"SIGOUT kind=p1 cycles=%llu old=%02x value=%02x changed=%02x\n",
				m_maincpu->total_cycles(),
				m_p1_last,
				data,
				m_p1_last ^ data);
		static constexpr u8 tracked_bits[] = { 2, 3, 5, 7 };
		for (u8 bit : tracked_bits)
		{
			if (BIT(m_p1_last ^ data, bit))
			{
				bridge_record(
						motronic_bridge_telemetry_kind::P1,
						m_maincpu->total_cycles(),
						0,
						bit,
						BIT(data, bit));
			}
		}
	}
	m_p1_last = data;
}

void motronic175_state::request_stop(const char *reason)
{
	if (m_stopping)
		return;
	m_reason = reason;
	m_stop_cycle = m_maincpu->total_cycles();
	m_stopping = true;
	machine().schedule_exit();
}

void motronic175_state::instruction(u16 pc)
{
	++m_instructions;
	m_last_pc = pc;
	m_deepest_pc = std::max(m_deepest_pc, pc);
	m_pc_hash ^= pc;
	m_pc_hash *= 0x100000001b3ULL;
	m_xdata->begin_instruction(pc, m_maincpu->total_cycles());
	if (pc >= 0x5c00 && pc <= 0x5d0f)
		m_startup_frontier = std::max(m_startup_frontier, pc);
	if (pc == 0x5c00)
	{
		++m_init_entries;
		if (m_init_entries > 1 && !m_bridge_enabled)
			request_stop("restart");
	}
	if (pc == 0x001b)
		++m_timer1_entries;
	if (pc == 0x002b)
		++m_timer2_entries;
	if (pc == 0x000b)
		++m_timer0_entries;
	if (pc == 0x0053)
		++m_capture_entries;
	if (pc == 0x0063)
		++m_vector0063_entries;
	if (pc == 0x006b)
		++m_vector006b_entries;
	if (pc == 0x908d)
		++m_supervisor_entries;
	if (pc == 0x601a)
	{
		++m_foreground_entries;
		if (!m_bridge_enabled && !m_continue_foreground)
			request_stop("foreground");
	}
	if (!m_bridge_enabled && m_instructions >= m_instruction_limit)
		request_stop("instruction-limit");
}

TIMER_CALLBACK_MEMBER(motronic175_state::timeout)
{
	request_stop("cycle-timeout");
}

void motronic175_state::report()
{
	m_xdata->report();
	logerror(
			"ESUMMARY reason=%s instructions=%llu cycles=%llu exit_cycles=%llu "
			"last_pc=%04x deepest_pc=%04x startup_frontier=%04x "
			"init_entries=%u supervisor_entries=%u foreground_entries=%u "
			"timer1_entries=%u timer2_entries=%u crank_transitions=%llu "
			"capture_entries=%u pc_hash=%016llx p1_last=%02x "
			"p1_transitions=%llu\n",
			m_reason, m_instructions, m_stop_cycle, m_maincpu->total_cycles(),
			m_last_pc, m_deepest_pc, m_startup_frontier, m_init_entries,
			m_supervisor_entries, m_foreground_entries,
			m_timer1_entries, m_timer2_entries, m_crank_index,
			m_capture_entries, m_pc_hash, m_p1_last, m_p1_transitions);
}
