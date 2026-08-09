// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "motronic175-signal-provider.h"

#include <charconv>
#include <system_error>

namespace {

std::string_view trim(std::string_view text)
{
	const std::size_t first = text.find_first_not_of(" \t");
	if (first == std::string_view::npos)
		return {};
	const std::size_t last = text.find_last_not_of(" \t");
	return text.substr(first, last - first + 1);
}

bool parse_number(
		std::string_view text,
		int base,
		std::uint64_t maximum,
		std::uint64_t &result)
{
	text = trim(text);
	if (text.empty())
		return false;
	std::uint64_t parsed = 0;
	const auto converted =
			std::from_chars(text.data(), text.data() + text.size(), parsed, base);
	if (converted.ec != std::errc()
			|| converted.ptr != text.data() + text.size()
			|| parsed > maximum)
		return false;
	result = parsed;
	return true;
}

unsigned port_index(std::uint8_t port)
{
	switch (port)
	{
	case 3: return 0;
	case 5: return 1;
	case 6: return 2;
	default: return 3;
	}
}

} // anonymous namespace

bool motronic175_signal_provider::add_event(
		std::uint64_t cycle,
		target signal,
		std::uint8_t value,
		std::string &error)
{
	if (m_event_count == MAX_EVENTS)
	{
		error = "signal script exceeds 32 events";
		return false;
	}
	m_events[m_event_count++] = { cycle, signal, value };
	return true;
}

bool motronic175_signal_provider::load_scenario(
		std::string_view name,
		std::string &error)
{
	m_defaults = { 0x00, 0x00, 0xff, 0xff, 0xff };
	m_event_count = 0;
	m_enabled = name != "off";
	if (name == "off")
		return true;
	if (name == "key-on")
	{
		m_defaults[0] = 0x01;
		return add_event(4096, target::A040, 0x00, error);
	}
	if (name == "crank")
	{
		m_defaults[0] = 0x01;
		return add_event(4096, target::A040, 0x00, error)
				&& add_event(8192, target::P3, 0xef, error)
				&& add_event(12288, target::P3, 0xff, error);
	}
	if (name == "idle"
			|| name == "part-load"
			|| name == "wot"
			|| name == "overrun")
	{
		m_defaults[0] = 0x41;
		return add_event(4096, target::A040, 0x40, error);
	}
	if (name == "fault-inputs")
	{
		m_defaults = { 0x01, 0xff, 0xef, 0xe7, 0x00 };
		return true;
	}
	error = "unknown signal scenario: " + std::string(name);
	return false;
}

bool motronic175_signal_provider::parse_script(
		std::string_view text,
		std::string &error)
{
	while (!text.empty())
	{
		const std::size_t comma = text.find(',');
		const std::string_view item =
				trim(text.substr(0, comma));
		const std::size_t colon = item.find(':');
		const std::size_t equals = item.find('=');
		if (item.empty() || colon == std::string_view::npos
				|| equals == std::string_view::npos || colon > equals)
		{
			error = "signal entry must be cycle:target=hex-value";
			return false;
		}

		std::uint64_t cycle = 0;
		std::uint64_t byte = 0;
		if (!parse_number(item.substr(0, colon), 10, UINT64_MAX, cycle)
				|| !parse_number(item.substr(equals + 1), 16, 0xff, byte))
		{
			error = "invalid cycle or byte in signal entry";
			return false;
		}

		const std::string_view label =
				trim(item.substr(colon + 1, equals - colon - 1));
		target signal;
		if (label == "a040")
			signal = target::A040;
		else if (label == "a041")
			signal = target::A041;
		else if (label == "p3")
			signal = target::P3;
		else if (label == "p5")
			signal = target::P5;
		else if (label == "p6")
			signal = target::P6;
		else
		{
			error = "unknown signal target: " + std::string(label);
			return false;
		}
		if (!add_event(cycle, signal, std::uint8_t(byte), error))
			return false;
		text = comma == std::string_view::npos
				? std::string_view()
				: text.substr(comma + 1);
	}
	return true;
}

bool motronic175_signal_provider::configure(
		std::string_view scenario,
		std::string_view script,
		std::string &error)
{
	error.clear();
	if (!load_scenario(scenario, error))
		return false;
	if (!script.empty() && !m_enabled)
	{
		error = "signal script requires a scenario other than off";
		return false;
	}
	return parse_script(script, error);
}

bool motronic175_signal_provider::enabled() const
{
	return m_enabled;
}

bool motronic175_signal_provider::set_dynamic_port(
		std::uint8_t port,
		std::uint8_t value)
{
	const unsigned index = port_index(port);
	if (index >= m_dynamic_ports.size())
		return false;
	m_dynamic_ports[index] = value;
	m_dynamic_port_configured[index] = true;
	return true;
}

std::uint8_t motronic175_signal_provider::value(
		target signal,
		std::uint64_t cycle) const
{
	std::uint8_t result = m_defaults[static_cast<unsigned>(signal)];
	std::uint64_t latest_cycle = 0;
	bool matched = false;
	for (unsigned index = 0; index < m_event_count; ++index)
	{
		const event &candidate = m_events[index];
		if (candidate.signal == signal && candidate.cycle <= cycle
				&& (!matched || candidate.cycle >= latest_cycle))
		{
			result = candidate.value;
			latest_cycle = candidate.cycle;
			matched = true;
		}
	}
	return result;
}

std::uint8_t motronic175_signal_provider::read_port(
		std::uint8_t port,
		std::uint64_t cycle) const
{
	const unsigned index = port_index(port);
	if (index < m_dynamic_ports.size() && m_dynamic_port_configured[index])
		return m_dynamic_ports[index];
	switch (port)
	{
	case 3: return value(target::P3, cycle);
	case 5: return value(target::P5, cycle);
	case 6: return value(target::P6, cycle);
	default: return 0xff;
	}
}

std::uint8_t motronic175_signal_provider::read_xdata(
		std::uint16_t address,
		std::uint64_t cycle) const
{
	switch (address)
	{
	case 0xa040: return value(target::A040, cycle);
	case 0xa041: return value(target::A041, cycle);
	default: return 0x00;
	}
}
