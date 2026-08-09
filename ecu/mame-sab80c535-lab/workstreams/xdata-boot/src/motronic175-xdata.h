// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#ifndef MAME_SKELETON_MOTRONIC175_XDATA_H
#define MAME_SKELETON_MOTRONIC175_XDATA_H

#pragma once

#include "emu.h"

#include <array>
#include <bitset>

class motronic175_xdata_device : public device_t
{
public:
	motronic175_xdata_device(
			const machine_config &mconfig,
			const char *tag,
			device_t *owner,
			u32 clock = 0);

	void begin_instruction(u16 pc) { m_instruction_pc = pc; }
	u8 read(offs_t offset);
	void write(offs_t offset, u8 data);
	void report();

protected:
	virtual void device_start() override ATTR_COLD;
	virtual void device_reset() override ATTR_COLD;

private:
	static constexpr unsigned MAX_DISTINCT_ACCESSES = 512;

	bool is_xram(u16 address) const;
	const char *classify(u16 address, bool write) const;
	u16 dependency_pc(u16 read_pc) const;
	void observe(u16 address, u8 value, bool write, bool unknown);

	std::array<u8, 0x0400> m_xram{};
	std::array<u8, 2> m_output_latches{};
	std::bitset<0x10000> m_seen_reads;
	std::bitset<0x10000> m_seen_writes;
	u16 m_instruction_pc = 0;
	u16 m_first_unknown_read_pc = 0xffff;
	unsigned m_distinct_accesses = 0;
	unsigned m_unknown_reads = 0;
	bool m_xram_enabled = true;
	bool m_overflow = false;
	bool m_reported = false;
};

DECLARE_DEVICE_TYPE(MOTRONIC175_XDATA, motronic175_xdata_device)

#endif // MAME_SKELETON_MOTRONIC175_XDATA_H
