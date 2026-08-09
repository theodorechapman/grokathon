// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#ifndef MAME_SKELETON_MOTRONIC175_BRIDGE_PROTOCOL_H
#define MAME_SKELETON_MOTRONIC175_BRIDGE_PROTOCOL_H

#pragma once

#include "motronic175-bridge-types.h"

#include <string>
#include <string_view>

class motronic175_bridge_protocol
{
public:
	static std::string error_frame(std::string_view message);
	static std::string frame(
			const motronic_bridge_command &advance,
			const std::vector<motronic_bridge_telemetry> &telemetry,
			const motronic_bridge_counters &counters);
	static bool parse(
			std::string_view line,
			motronic_bridge_command &command,
			std::string &error);
	static std::string ready(std::uint64_t cycle);
	static bool validate_advance(
			const motronic_bridge_command &command,
			std::uint64_t expected_seq,
			std::uint64_t current_cycle,
			std::string &error);
};

#endif
