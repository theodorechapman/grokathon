// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#ifndef MAME_SKELETON_MOTRONIC175_BRIDGE_TYPES_H
#define MAME_SKELETON_MOTRONIC175_BRIDGE_TYPES_H

#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

constexpr char MOTRONIC_BRIDGE_SCHEMA[] = "motronic-bridge/v1";
constexpr std::size_t MOTRONIC_BRIDGE_MAX_EVENTS = 4'096;
constexpr std::uint64_t MOTRONIC_BRIDGE_MAX_BATCH_CYCLES = 12'000'000;
constexpr std::size_t MOTRONIC_BRIDGE_MAX_TELEMETRY = 16'384;

enum class motronic_bridge_command_kind : std::uint8_t
{
	HELLO,
	ADVANCE,
	SHUTDOWN
};

enum class motronic_bridge_event_kind : std::uint8_t
{
	XDATA,
	ADC,
	PORT,
	CC0
};

struct motronic_bridge_event
{
	std::uint64_t cycle = 0;
	motronic_bridge_event_kind kind = motronic_bridge_event_kind::XDATA;
	std::uint16_t address = 0;
	std::uint8_t selector = 0;
	std::uint8_t value = 0;
};

struct motronic_bridge_command
{
	motronic_bridge_command_kind kind = motronic_bridge_command_kind::HELLO;
	std::uint64_t seq = 0;
	std::uint64_t from_cycle = 0;
	std::uint64_t to_cycle = 0;
	std::vector<motronic_bridge_event> events;
};

enum class motronic_bridge_telemetry_kind : std::uint8_t
{
	P1,
	XDATA_WRITE,
	SFR_WRITE
};

struct motronic_bridge_telemetry
{
	std::uint64_t cycle = 0;
	motronic_bridge_telemetry_kind kind =
			motronic_bridge_telemetry_kind::P1;
	std::uint16_t address = 0;
	std::uint8_t selector = 0;
	std::uint8_t value = 0;
};

struct motronic_bridge_counters
{
	std::uint64_t instructions = 0;
	std::uint32_t init = 0;
	std::uint32_t supervisor = 0;
	std::uint32_t foreground = 0;
	std::uint32_t timer0 = 0;
	std::uint32_t timer1 = 0;
	std::uint32_t timer2 = 0;
	std::uint32_t capture = 0;
	std::uint32_t vector0063 = 0;
	std::uint32_t vector006b = 0;
	std::uint64_t unknown_xdata_reads = 0;
};

#endif
