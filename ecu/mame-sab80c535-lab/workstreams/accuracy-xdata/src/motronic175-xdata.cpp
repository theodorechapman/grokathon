// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "emu.h"
#include "motronic175-xdata.h"

DEFINE_DEVICE_TYPE(
		MOTRONIC175_XDATA,
		motronic175_xdata_device,
		"motronic175_xdata",
		"Motronic 1.7 evidence-bounded XDATA model")

motronic175_xdata_device::motronic175_xdata_device(
		const machine_config &mconfig,
		const char *tag,
		device_t *owner,
		u32 clock)
	: device_t(mconfig, MOTRONIC175_XDATA, tag, owner, clock)
	, m_output_cb(*this)
{
}

u16 motronic175_xdata_device::branch_dependency(u16 read_pc) const
{
	switch (read_pc)
	{
	case 0x5cea: return 0x5cef;
	case 0x315a: return 0x315e;
	case 0x316e: return 0x316f;
	default: return 0xffff;
	}
}

void motronic175_xdata_device::begin_instruction(u16 pc, u64 cycle)
{
	m_instruction_pc = pc;
	m_cycle = cycle;
	if (m_taint_branch_seen)
	{
		logerror(
				"TAINT outcome read_pc=%04x addr=%04x value=%02x "
				"branch_pc=%04x next_pc=%04x\n",
				m_taint_read_pc, m_taint_address, m_taint_value,
				m_taint_branch, pc);
		m_taint_read_pc = 0xffff;
		m_taint_branch_seen = false;
		if (m_stop_after_taint)
			machine().schedule_exit();
	}
	else if (m_taint_read_pc != 0xffff && pc == m_taint_branch)
	{
		logerror(
				"TAINT branch read_pc=%04x addr=%04x value=%02x branch_pc=%04x\n",
				m_taint_read_pc, m_taint_address, m_taint_value, pc);
		m_taint_branch_seen = true;
	}
}

const char *motronic175_xdata_device::read_class(u16 address, bool known) const
{
	if (address <= 0x03ff)
		return known ? "storage" : "storage-unknown";
	if (address == 0xa040 || address == 0xa041 || address == 0xa081)
		return "input-status";
	return "unknown-read";
}

const char *motronic175_xdata_device::write_class(u16 address) const
{
	if (address <= 0x03ff)
		return "storage";
	if (address == 0xa040 || address == 0xa041)
		return "output-latch";
	return "unknown-write";
}

void motronic175_xdata_device::observe(
		u16 address, u8 value, bool write, bool tainted, const char *classification)
{
	++m_events;
	(write ? m_seen_writes : m_seen_reads).set(address);
	if (m_trace_events)
	{
		logerror(
				"XEV seq=%llu op=%c addr=%04x pc=%04x value=%02x "
				"class=%s taint=%u\n",
				m_events, write ? 'W' : 'R', address, m_instruction_pc,
				value, classification, tainted ? 1 : 0);
	}
	if (m_event_limit && m_events > m_event_limit && !m_overflow)
	{
		m_overflow = true;
		logerror("XMODEL overflow limit=%llu\n", m_event_limit);
		machine().schedule_exit();
	}
}

u8 motronic175_xdata_device::unknown_read(u16 address, const char *kind)
{
	const bool configured =
			(address & 0xff00) == 0xa000 && m_input_configured[address & 0xff];
	const u8 value = configured ? m_inputs[address & 0xff] : m_unknown_value;
	++m_unknown_reads;
	if (m_first_unknown_pc == 0xffff)
	{
		m_first_unknown_pc = m_instruction_pc;
		m_first_unknown_address = address;
	}
	m_taint_read_pc = m_instruction_pc;
	m_taint_address = address;
	m_taint_value = value;
	m_taint_branch = branch_dependency(m_instruction_pc);
	logerror(
			"UNKNOWN read addr=%04x pc=%04x value=%02x kind=%s source=%s "
			"branch_pc=%04x\n",
			address, m_instruction_pc, value, kind,
			configured ? "configured-input" : "global-approximation",
			m_taint_branch);
	return value;
}

u8 motronic175_xdata_device::read(offs_t offset)
{
	const u16 address = u16(offset);
	const bool explicit_input =
			(address & 0xff00) == 0xa000 && m_input_configured[address & 0xff];
	if (explicit_input)
	{
		const u8 value = m_inputs[address & 0xff];
		if (!machine().side_effects_disabled())
			observe(address, value, false, false, read_class(address, true));
		return value;
	}
	if (m_signals.enabled() && (address == 0xa040 || address == 0xa041))
	{
		const u8 value = m_signals.read_xdata(address, m_cycle);
		if (!machine().side_effects_disabled())
			observe(address, value, false, false, read_class(address, true));
		return value;
	}
	if (address <= 0x03ff && m_storage_known[address])
	{
		const u8 value = m_storage[address];
		if (!machine().side_effects_disabled())
			observe(address, value, false, false, read_class(address, true));
		return value;
	}
	if (machine().side_effects_disabled())
		return 0;
	const u8 value = unknown_read(address, read_class(address, false));
	observe(address, value, false, true, read_class(address, false));
	if (m_policy == unknown_policy::STOP && !m_stop_requested)
	{
		m_stop_requested = true;
		logerror("XMODEL stop=unknown-read\n");
		machine().schedule_exit();
	}
	return value;
}

u8 motronic175_xdata_device::read_port(u8 port) const
{
	return m_signals.read_port(port, m_cycle);
}

void motronic175_xdata_device::set_input(u16 address, u8 value)
{
	if ((address & 0xff00) != 0xa000)
		fatalerror("signal input address outside A000-A0FF: %04x\n", address);
	m_inputs[address & 0xff] = value;
	m_input_configured[address & 0xff] = 1;
	logerror(
			"SIGIN kind=xdata-input cycles=%llu address=%04x value=%02x\n",
			m_cycle,
			address,
			value);
}

void motronic175_xdata_device::set_port_input(u8 port, u8 value)
{
	if (!m_signals.set_dynamic_port(port, value))
		fatalerror("signal input port must be P3, P5, or P6: %u\n", port);
	logerror(
			"SIGIN kind=port-input cycles=%llu port=%u value=%02x\n",
			m_cycle,
			port,
			value);
}

void motronic175_xdata_device::write(offs_t offset, u8 data)
{
	const u16 address = u16(offset);
	if (address <= 0x03ff)
	{
		m_storage[address] = data;
		m_storage_known[address] = 1;
	}
	else if (address == 0xa040 || address == 0xa041)
	{
		const unsigned index = address - 0xa040;
		m_output_latches[index] = data;
		m_output_written[index] = 1;
		m_output_cb(address, data);
	}
	observe(address, data, true, false, write_class(address));
}

void motronic175_xdata_device::report()
{
	if (m_reported)
		return;
	m_reported = true;
	logerror(
			"XSUMMARY events=%llu read_addresses=%u write_addresses=%u "
			"unknown_reads=%llu first_unknown_addr=%04x first_unknown_pc=%04x "
			"overflow=%u out40_written=%u out41_written=%u out40=%02x out41=%02x\n",
			m_events, unsigned(m_seen_reads.count()), unsigned(m_seen_writes.count()),
			m_unknown_reads, m_first_unknown_address, m_first_unknown_pc,
			m_overflow ? 1 : 0, m_output_written[0], m_output_written[1],
			m_output_latches[0], m_output_latches[1]);
}
