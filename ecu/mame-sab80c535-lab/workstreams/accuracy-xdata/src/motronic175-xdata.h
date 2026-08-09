// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#ifndef MAME_SKELETON_MOTRONIC175_XDATA_H
#define MAME_SKELETON_MOTRONIC175_XDATA_H

#pragma once

#include "emu.h"
#include "motronic175-signal-provider.h"

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

	auto output_cb() { return m_output_cb.bind(); }
	void begin_instruction(u16 pc, u64 cycle);
	u8 read(offs_t offset);
	u8 read_port(u8 port) const;
	void report();
	void set_input(u16 address, u8 value);
	void set_port_input(u8 port, u8 value);
	u64 unknown_reads() const { return m_unknown_reads; }
	void write(offs_t offset, u8 data);

protected:
	virtual void device_reset() override ATTR_COLD;
	virtual void device_start() override ATTR_COLD;

private:
	enum class unknown_policy : u8 { STOP, VALUE };
	enum class storage_reset : u8 { UNKNOWN, ZERO, ONES, PRESERVE };

	static constexpr unsigned MAX_EVENTS = 16'384;

	const char *read_class(u16 address, bool known) const;
	const char *write_class(u16 address) const;
	u16 branch_dependency(u16 read_pc) const;
	u8 unknown_read(u16 address, const char *kind);
	void configure();
	void observe(
			u16 address,
			u8 value,
			bool write,
			bool tainted,
			const char *classification);
	void parse_inputs(const char *text);

	std::array<u8, 0x0400> m_storage{};
	std::array<u8, 0x0400> m_storage_known{};
	std::array<u8, 0x0100> m_inputs{};
	std::array<u8, 0x0100> m_input_configured{};
	std::array<u8, 2> m_output_latches{};
	std::array<u8, 2> m_output_written{};
	std::bitset<0x10000> m_seen_reads;
	std::bitset<0x10000> m_seen_writes;
	devcb_write8 m_output_cb;
	motronic175_signal_provider m_signals;
	u64 m_events = 0;
	u64 m_event_limit = MAX_EVENTS;
	u64 m_unknown_reads = 0;
	u64 m_cycle = 0;
	u16 m_instruction_pc = 0;
	u16 m_first_unknown_address = 0xffff;
	u16 m_first_unknown_pc = 0xffff;
	u16 m_taint_address = 0xffff;
	u16 m_taint_branch = 0xffff;
	u16 m_taint_read_pc = 0xffff;
	u8 m_taint_value = 0;
	u8 m_unknown_value = 0;
	unknown_policy m_policy = unknown_policy::STOP;
	storage_reset m_reset_policy = storage_reset::UNKNOWN;
	bool m_configured = false;
	bool m_overflow = false;
	bool m_reported = false;
	bool m_stop_after_taint = false;
	bool m_stop_requested = false;
	bool m_taint_branch_seen = false;
	bool m_trace_events = true;
};

DECLARE_DEVICE_TYPE(MOTRONIC175_XDATA, motronic175_xdata_device)

#endif
