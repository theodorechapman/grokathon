// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#ifndef MAME_SKELETON_MOTRONIC175_ADC_H
#define MAME_SKELETON_MOTRONIC175_ADC_H

#pragma once

#include <array>
#include <cstdint>
#include <string>

class motronic175_adc_provider
{
public:
	bool configure(
			const char *profile_name,
			const char *fault_channel,
			std::string &error);
	const char *profile_name() const;
	std::uint8_t sample(
			std::uint8_t channel,
			std::uint64_t elapsed_us) const;
	bool set_dynamic(
			std::uint8_t channel,
			std::uint8_t callback_code);

private:
	enum class profile : std::uint8_t
	{
		KEY_ON,
		COLD_CRANK,
		WARM_IDLE,
		PART_LOAD,
		WOT,
		OVERRUN,
		SENSOR_OPEN,
		SENSOR_SHORT
	};

	profile m_profile = profile::KEY_ON;
	std::array<std::uint8_t, 8> m_dynamic{};
	std::array<bool, 8> m_dynamic_configured{};
	std::uint8_t m_fault_channel = 3;
};

#endif
