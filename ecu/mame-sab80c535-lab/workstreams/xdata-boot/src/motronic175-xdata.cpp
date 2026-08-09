// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "emu.h"
#include "motronic175-xdata.h"

#include <cstdlib>

DEFINE_DEVICE_TYPE(
		MOTRONIC175_XDATA,
		motronic175_xdata_device,
		"motronic175_xdata",
		"Motronic 1.7 external XDATA model")

motronic175_xdata_device::motronic175_xdata_device(
		const machine_config &mconfig,
		const char *tag,
		device_t *owner,
		u32 clock)
	: device_t(mconfig, MOTRONIC175_XDATA, tag, owner, clock)
{
}

void motronic175_xdata_device::device_start()
{
	m_xram_enabled = std::getenv("MOTRONIC_XRAM_DISABLE") == nullptr;
	save_item(NAME(m_xram));
	save_item(NAME(m_output_latches));
	logerror(
			"XDATA model storage=%s unknown_read=open-bus-ff "
			"xram_approx=0000-03ff\n",
			m_xram_enabled ? "enabled" : "disabled");
}

void motronic175_xdata_device::device_reset()
{
	m_xram.fill(0);
	m_output_latches.fill(0);
	m_seen_reads.reset();
	m_seen_writes.reset();
	m_instruction_pc = 0;
	m_first_unknown_read_pc = 0xffff;
	m_distinct_accesses = 0;
	m_unknown_reads = 0;
	m_overflow = false;
	m_reported = false;
}

bool motronic175_xdata_device::is_xram(u16 address) const
{
	// PROVEN: firmware uses MOVX read/write state, marker checks, bulk clear,
	// and records in pages 00-03.  APPROXIMATION: a contiguous 1 KiB decode
	// and zeroed power-on contents; physical retention technology is unknown.
	return address <= 0x03ff;
}

const char *motronic175_xdata_device::classify(u16 address, bool write) const
{
	if (is_xram(address))
		return m_xram_enabled ? "retained-xram-approx" : "xram-disabled";
	if (address == 0xa040 || address == 0xa041)
		return write ? "output-latch" : "input-status-unknown";
	if ((address >= 0xa002 && address <= 0xa005)
			|| (address >= 0xa008 && address <= 0xa011)
			|| (address >= 0xa020 && address <= 0xa021)
			|| address == 0xa081)
		return "asic-register-unknown";
	return "unknown-xdata";
}

u16 motronic175_xdata_device::dependency_pc(u16 read_pc) const
{
	// Static disassembly proves these early reads feed the listed decision.
	switch (read_pc)
	{
	case 0x5c54: return 0x5c55;
	case 0x5c60: return 0x5c61;
	case 0x5c69: return 0x5c6b;
	case 0x5c81: return 0x5c82;
	case 0x5c97: return 0x5c98;
	default: return 0xffff;
	}
}

void motronic175_xdata_device::observe(
		u16 address,
		u8 value,
		bool write,
		bool unknown)
{
	std::bitset<0x10000> &seen = write ? m_seen_writes : m_seen_reads;
	if (!seen.test(address))
	{
		seen.set(address);
		++m_distinct_accesses;
		logerror(
				"XDATA first op=%c addr=%04x pc=%04x value=%02x "
				"class=%s unknown=%u\n",
				write ? 'W' : 'R',
				address,
				m_instruction_pc,
				value,
				classify(address, write),
				unknown ? 1 : 0);
	}

	if (unknown && !write)
	{
		++m_unknown_reads;
		if (m_first_unknown_read_pc == 0xffff)
		{
			m_first_unknown_read_pc = m_instruction_pc;
			const u16 decision = dependency_pc(m_instruction_pc);
			if (decision == 0xffff)
				logerror(
						"XDATA dependency first_unknown_read_pc=%04x "
						"decision_pc=unresolved\n",
						m_instruction_pc);
			else
				logerror(
						"XDATA dependency first_unknown_read_pc=%04x "
						"decision_pc=%04x value=%02x\n",
						m_instruction_pc,
						decision,
						value);
		}
	}

	if (m_distinct_accesses > MAX_DISTINCT_ACCESSES && !m_overflow)
	{
		m_overflow = true;
		logerror("XDATA observation overflow limit=%u\n", MAX_DISTINCT_ACCESSES);
		machine().schedule_exit();
	}
}

u8 motronic175_xdata_device::read(offs_t offset)
{
	const u16 address = u16(offset);
	const bool backed = m_xram_enabled && is_xram(address);
	const u8 value = backed ? m_xram[address] : 0xff;
	if (!machine().side_effects_disabled())
		observe(address, value, false, !backed);
	return value;
}

void motronic175_xdata_device::write(offs_t offset, u8 data)
{
	const u16 address = u16(offset);
	if (m_xram_enabled && is_xram(address))
		m_xram[address] = data;
	else if (address == 0xa040)
		m_output_latches[0] = data;
	else if (address == 0xa041)
		m_output_latches[1] = data;
	observe(address, data, true, false);
}

void motronic175_xdata_device::report()
{
	if (m_reported)
		return;
	m_reported = true;
	logerror(
			"XDATA summary distinct=%u unknown_reads=%u "
			"first_unknown_read_pc=%04x overflow=%u "
			"out_a040=%02x out_a041=%02x\n",
			m_distinct_accesses,
			m_unknown_reads,
			m_first_unknown_read_pc,
			m_overflow ? 1 : 0,
			m_output_latches[0],
			m_output_latches[1]);
}
