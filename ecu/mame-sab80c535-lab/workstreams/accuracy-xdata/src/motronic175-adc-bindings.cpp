// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "motronic175-state.h"

u8 motronic175_state::adc_sample(unsigned channel)
{
	const u64 elapsed_us = machine().time().as_ticks(1'000'000);
	return m_adc.sample(channel, elapsed_us);
}

u8 motronic175_state::adc0_r() { return adc_sample(0); }
u8 motronic175_state::adc1_r() { return adc_sample(1); }
u8 motronic175_state::adc2_r() { return adc_sample(2); }
u8 motronic175_state::adc3_r() { return adc_sample(3); }
u8 motronic175_state::adc4_r() { return adc_sample(4); }
u8 motronic175_state::adc5_r() { return adc_sample(5); }
u8 motronic175_state::adc6_r() { return adc_sample(6); }
u8 motronic175_state::adc7_r() { return adc_sample(7); }
