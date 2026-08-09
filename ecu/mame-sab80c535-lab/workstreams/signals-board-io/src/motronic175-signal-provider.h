// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#ifndef MAME_SKELETON_MOTRONIC175_SIGNAL_PROVIDER_H
#define MAME_SKELETON_MOTRONIC175_SIGNAL_PROVIDER_H

#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <string_view>

class motronic175_signal_provider
{
public:
	bool configure(
			std::string_view scenario,
			std::string_view script,
			std::string &error);
	bool enabled() const;
	std::uint8_t read_port(std::uint8_t port, std::uint64_t cycle) const;
	std::uint8_t read_xdata(std::uint16_t address, std::uint64_t cycle) const;
	bool set_dynamic_port(std::uint8_t port, std::uint8_t value);

private:
	enum class target : std::uint8_t { A040, A041, P3, P5, P6 };

	struct event
	{
		std::uint64_t cycle;
		target signal;
		std::uint8_t value;
	};

	static constexpr unsigned MAX_EVENTS = 32;

	bool add_event(
			std::uint64_t cycle,
			target signal,
			std::uint8_t value,
			std::string &error);
	bool load_scenario(std::string_view name, std::string &error);
	bool parse_script(std::string_view text, std::string &error);
	std::uint8_t value(target signal, std::uint64_t cycle) const;

	std::array<std::uint8_t, 5> m_defaults{};
	std::array<std::uint8_t, 3> m_dynamic_ports{};
	std::array<bool, 3> m_dynamic_port_configured{};
	std::array<event, MAX_EVENTS> m_events{};
	unsigned m_event_count = 0;
	bool m_enabled = false;
};

#endif
