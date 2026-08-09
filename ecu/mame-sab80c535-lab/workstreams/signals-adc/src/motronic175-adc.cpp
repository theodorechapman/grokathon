// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "motronic175-adc.h"

#include <array>
#include <charconv>
#include <cstring>

namespace {

using adc_values = std::array<std::uint8_t, 8>;

struct adc_frame
{
	std::uint64_t time_us;
	adc_values values;
};

struct adc_profile
{
	const char *name;
	const adc_frame *frames;
	std::size_t frame_count;
	bool loop;
};

constexpr adc_frame KEY_ON[] = {
	{ 0,      { 5, 85, 92, 90, 64, 64, 64, 64 } },
	{ 50'000, { 7, 98, 92, 90, 64, 64, 64, 64 } },
	{ 400'000,{ 7, 100, 92, 90, 64, 64, 64, 64 } },
};

constexpr adc_frame COLD_CRANK[] = {
	{ 0,      { 8, 100, 95, 102, 64, 64, 64, 64 } },
	{ 100'000,{ 18, 72, 95, 102, 62, 64, 64, 64 } },
	{ 250'000,{ 25, 68, 95, 102, 66, 64, 64, 64 } },
	{ 500'000,{ 18, 77, 95, 102, 62, 64, 64, 64 } },
	{ 900'000,{ 28, 88, 95, 102, 66, 64, 64, 64 } },
};

constexpr adc_frame WARM_IDLE[] = {
	{ 0,      { 27, 100, 58, 44, 48, 64, 64, 64 } },
	{ 100'000,{ 30, 100, 58, 44, 56, 64, 64, 64 } },
	{ 200'000,{ 26, 99, 58, 44, 72, 64, 64, 64 } },
	{ 300'000,{ 29, 100, 58, 44, 55, 64, 64, 64 } },
	{ 400'000,{ 27, 100, 58, 44, 48, 64, 64, 64 } },
};

constexpr adc_frame PART_LOAD[] = {
	{ 0,      { 27, 100, 58, 44, 52, 64, 64, 64 } },
	{ 100'000,{ 38, 99, 58, 44, 58, 64, 64, 64 } },
	{ 400'000,{ 52, 100, 58, 44, 68, 64, 64, 64 } },
	{ 800'000,{ 55, 100, 58, 44, 57, 64, 64, 64 } },
};

constexpr adc_frame WOT[] = {
	{ 0,      { 35, 100, 58, 44, 58, 64, 64, 64 } },
	{ 100'000,{ 75, 99, 58, 44, 66, 64, 64, 64 } },
	{ 250'000,{ 101, 98, 58, 44, 74, 64, 64, 64 } },
	{ 500'000,{ 104, 99, 58, 44, 72, 64, 64, 64 } },
};

constexpr adc_frame OVERRUN[] = {
	{ 0,      { 55, 100, 58, 44, 58, 64, 64, 64 } },
	{ 100'000,{ 30, 100, 58, 44, 52, 64, 64, 64 } },
	{ 300'000,{ 12, 100, 58, 44, 45, 64, 64, 64 } },
	{ 700'000,{ 7, 100, 58, 44, 48, 64, 64, 64 } },
};

template <std::size_t Size>
constexpr adc_profile make_profile(
		const char *name,
		const adc_frame (&frames)[Size],
		bool loop = false)
{
	return { name, frames, Size, loop };
}

constexpr adc_profile PROFILES[] = {
	make_profile("key-on", KEY_ON),
	make_profile("cold-crank", COLD_CRANK),
	make_profile("warm-idle", WARM_IDLE, true),
	make_profile("part-load", PART_LOAD),
	make_profile("wot", WOT),
	make_profile("overrun", OVERRUN),
	make_profile("sensor-open", WARM_IDLE),
	make_profile("sensor-short", WARM_IDLE),
};

std::uint8_t interpolate(
		const adc_frame &low,
		const adc_frame &high,
		std::uint8_t channel,
		std::uint64_t elapsed_us)
{
	const std::int64_t span = high.time_us - low.time_us;
	const std::int64_t position = elapsed_us - low.time_us;
	std::int64_t scaled =
			(std::int64_t(high.values[channel]) - low.values[channel])
			* position;
	scaled += scaled >= 0 ? span / 2 : -span / 2;
	return std::uint8_t(std::int64_t(low.values[channel]) + scaled / span);
}

} // anonymous namespace

bool motronic175_adc_provider::configure(
		const char *profile_name,
		const char *fault_channel,
		std::string &error)
{
	const char *requested =
			profile_name && *profile_name ? profile_name : "key-on";
	std::size_t index = 0;
	while (index < std::size(PROFILES)
			&& std::strcmp(requested, PROFILES[index].name))
		++index;
	if (index == std::size(PROFILES))
	{
		error = "invalid MOTRONIC_ADC_PROFILE=" + std::string(requested);
		return false;
	}

	if (fault_channel && *fault_channel)
	{
		unsigned parsed = 0;
		const char *end = fault_channel + std::strlen(fault_channel);
		const auto result = std::from_chars(fault_channel, end, parsed);
		if (result.ec != std::errc{} || result.ptr != end || parsed > 5)
		{
			error = "MOTRONIC_ADC_FAULT_CHANNEL must be 0..5";
			return false;
		}
		m_fault_channel = std::uint8_t(parsed);
	}

	m_profile = static_cast<profile>(index);
	error.clear();
	return true;
}

const char *motronic175_adc_provider::profile_name() const
{
	return PROFILES[static_cast<unsigned>(m_profile)].name;
}

bool motronic175_adc_provider::set_dynamic(
		std::uint8_t channel,
		std::uint8_t callback_code)
{
	if (channel >= m_dynamic.size() || callback_code > 127)
		return false;
	m_dynamic[channel] = callback_code;
	m_dynamic_configured[channel] = true;
	return true;
}

std::uint8_t motronic175_adc_provider::sample(
		std::uint8_t channel,
		std::uint64_t elapsed_us) const
{
	if (channel >= 8)
		return 64;
	if (m_dynamic_configured[channel])
		return m_dynamic[channel];

	const adc_profile &selected =
			PROFILES[static_cast<unsigned>(m_profile)];
	const adc_frame &last = selected.frames[selected.frame_count - 1];
	if (selected.loop && last.time_us)
		elapsed_us %= last.time_us;

	std::uint8_t value = last.values[channel];
	if (elapsed_us <= selected.frames[0].time_us)
		value = selected.frames[0].values[channel];
	else if (elapsed_us < last.time_us)
	{
		std::size_t high = 1;
		while (elapsed_us > selected.frames[high].time_us)
			++high;
		value = interpolate(
				selected.frames[high - 1],
				selected.frames[high],
				channel,
				elapsed_us);
	}

	const bool active_fault = elapsed_us >= 100'000
			&& channel == m_fault_channel;
	if (active_fault && m_profile == profile::SENSOR_OPEN)
		return 127;
	if (active_fault && m_profile == profile::SENSOR_SHORT)
		return 0;
	return value;
}
