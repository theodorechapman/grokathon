// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#ifndef MAME_SKELETON_MOTRONIC175_KW71_H
#define MAME_SKELETON_MOTRONIC175_KW71_H

#pragma once

#include "emu.h"

#include <vector>

class motronic175_kw71_device : public device_t
{
public:
	motronic175_kw71_device(
			const machine_config &mconfig,
			const char *tag,
			device_t *owner,
			u32 clock = 0);

	u8 p3_r();
	void p3_w(u8 data);

protected:
	virtual void device_reset() override ATTR_COLD;
	virtual void device_start() override ATTR_COLD;

private:
	struct transition
	{
		u64 time_us;
		u8 state;
	};

	TIMER_CALLBACK_MEMBER(advance);

	void add_byte(u64 time_us, u8 data, bool bad_stop);
	void add_transition(u64 time_us, u8 state);
	void load_stimulus(const char *path);
	void schedule_current();

	std::vector<transition> m_transitions;
	emu_timer *m_timer = nullptr;
	u64 m_bit_us = 104;
	u32 m_index = 0;
	u8 m_rx = 1;
	u8 m_tx = 1;
};

DECLARE_DEVICE_TYPE(MOTRONIC175_KW71, motronic175_kw71_device)

#endif
