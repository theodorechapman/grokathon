// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "emu.h"
#include "motronic175-kw71.h"

#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>

DEFINE_DEVICE_TYPE(
		MOTRONIC175_KW71,
		motronic175_kw71_device,
		"motronic175_kw71",
		"Motronic KW71 RXD line adapter")

namespace {

u64 parse_number(const std::string &text, int base, const char *label)
{
	char *end = nullptr;
	const u64 value = std::strtoull(text.c_str(), &end, base);
	if (!end || end == text.c_str() || *end)
		fatalerror("KW71 stimulus has invalid %s: %s\n", label, text);
	return value;
}

} // anonymous namespace

motronic175_kw71_device::motronic175_kw71_device(
		const machine_config &mconfig,
		const char *tag,
		device_t *owner,
		u32 clock)
	: device_t(mconfig, MOTRONIC175_KW71, tag, owner, clock)
{
}

void motronic175_kw71_device::add_transition(u64 time_us, u8 state)
{
	if (state > 1)
		fatalerror("KW71 stimulus line state must be 0 or 1\n");
	if (!m_transitions.empty() && time_us <= m_transitions.back().time_us)
		fatalerror("KW71 stimulus transitions must be strictly increasing\n");
	m_transitions.push_back({time_us, state});
}

void motronic175_kw71_device::add_byte(u64 time_us, u8 data, bool bad_stop)
{
	add_transition(time_us, 0);
	for (unsigned bit = 0; bit < 8; ++bit)
		add_transition(time_us + (bit + 1) * m_bit_us, BIT(data, bit));
	add_transition(time_us + 9 * m_bit_us, bad_stop ? 0 : 1);
	if (bad_stop)
		add_transition(time_us + 10 * m_bit_us, 1);
}

void motronic175_kw71_device::load_stimulus(const char *path)
{
	std::ifstream input(path);
	if (!input)
		fatalerror("cannot open MOTRONIC_KW71_STIMULUS=%s\n", path);

	std::string line;
	unsigned line_number = 0;
	bool have_timing = false;
	while (std::getline(input, line))
	{
		++line_number;
		const std::size_t comment = line.find('#');
		if (comment != std::string::npos)
			line.erase(comment);
		std::istringstream fields(line);
		std::string kind;
		if (!(fields >> kind))
			continue;
		if (kind == "bit-us")
		{
			std::string value;
			std::string extra;
			if (have_timing || !m_transitions.empty()
					|| !(fields >> value) || (fields >> extra))
				fatalerror("KW71 stimulus line %u has misplaced bit-us\n", line_number);
			m_bit_us = parse_number(value, 10, "bit period");
			if (!m_bit_us || m_bit_us > 100'000)
				fatalerror("KW71 stimulus bit period is out of range\n");
			have_timing = true;
			continue;
		}
		if (!have_timing)
			fatalerror("KW71 stimulus line %u precedes bit-us\n", line_number);

		std::string time_text;
		std::string value_text;
		if (!(fields >> time_text >> value_text))
			fatalerror("KW71 stimulus line %u is incomplete\n", line_number);
		const u64 time_us = parse_number(time_text, 10, "timestamp");
		if (kind == "line")
		{
			std::string extra;
			const u64 state = parse_number(value_text, 10, "line state");
			if ((fields >> extra) || state > 1)
				fatalerror("KW71 stimulus line %u has invalid line record\n", line_number);
			add_transition(time_us, state);
			continue;
		}
		if (kind != "byte")
			fatalerror("KW71 stimulus line %u has unknown record %s\n", line_number, kind);
		std::string stop;
		std::string extra;
		const u64 data = parse_number(value_text, 16, "byte");
		if (!(fields >> stop) || (fields >> extra) || data > 0xff)
			fatalerror("KW71 stimulus line %u has invalid byte record\n", line_number);
		if (stop != "good" && stop != "bad")
			fatalerror("KW71 stimulus line %u has invalid stop mode\n", line_number);
		add_byte(time_us, data, stop == "bad");
	}
	if (!have_timing)
		fatalerror("KW71 stimulus has no bit-us declaration\n");
}

void motronic175_kw71_device::device_start()
{
	if (const char *path = std::getenv("MOTRONIC_KW71_STIMULUS"))
		load_stimulus(path);
	m_timer = timer_alloc(FUNC(motronic175_kw71_device::advance), this);
	save_item(NAME(m_index));
	save_item(NAME(m_rx));
	save_item(NAME(m_tx));
}

void motronic175_kw71_device::device_reset()
{
	m_index = 0;
	m_rx = 1;
	m_tx = 1;
	schedule_current();
}

void motronic175_kw71_device::schedule_current()
{
	if (m_index >= m_transitions.size())
	{
		m_timer->adjust(attotime::never);
		return;
	}
	const u64 previous = m_index ? m_transitions[m_index - 1].time_us : 0;
	m_timer->adjust(attotime::from_usec(m_transitions[m_index].time_us - previous));
}

TIMER_CALLBACK_MEMBER(motronic175_kw71_device::advance)
{
	const transition &event = m_transitions[m_index++];
	m_rx = event.state;
	logerror("KW71_RX usec=%llu state=%u\n", event.time_us, m_rx);
	schedule_current();
}

u8 motronic175_kw71_device::p3_r()
{
	return 0xfe | m_rx;
}

void motronic175_kw71_device::p3_w(u8 data)
{
	const u8 tx = BIT(data, 1);
	if (tx == m_tx)
		return;
	m_tx = tx;
	logerror(
			"KW71_TX usec=%llu state=%u\n",
			machine().time().as_ticks(1'000'000),
			m_tx);
}
