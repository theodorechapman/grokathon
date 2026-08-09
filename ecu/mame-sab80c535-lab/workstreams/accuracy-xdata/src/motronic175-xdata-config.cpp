// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "emu.h"
#include "motronic175-xdata.h"

#include <algorithm>
#include <cstdlib>
#include <string>

void motronic175_xdata_device::parse_inputs(const char *text)
{
	if (!text || !*text)
		return;
	std::string remaining(text);
	while (!remaining.empty())
	{
		const std::size_t comma = remaining.find(',');
		const std::string item = remaining.substr(0, comma);
		const std::size_t equals = item.find('=');
		if (equals == std::string::npos)
			fatalerror("MOTRONIC_INPUTS entry lacks '=': %s\n", item.c_str());
		char *address_end = nullptr;
		char *value_end = nullptr;
		const unsigned long address =
				std::strtoul(item.substr(0, equals).c_str(), &address_end, 16);
		const unsigned long value =
				std::strtoul(item.substr(equals + 1).c_str(), &value_end, 16);
		if (!address_end || *address_end || !value_end || *value_end
				|| address < 0xa000 || address > 0xa0ff || value > 0xff)
			fatalerror("invalid MOTRONIC_INPUTS entry: %s\n", item.c_str());
		m_inputs[address & 0xff] = u8(value);
		m_input_configured[address & 0xff] = 1;
		remaining = comma == std::string::npos ? "" : remaining.substr(comma + 1);
	}
}

void motronic175_xdata_device::configure()
{
	if (const char *limit = std::getenv("MOTRONIC_XDATA_EVENT_LIMIT"))
	{
		char *end = nullptr;
		const u64 parsed = std::strtoull(limit, &end, 10);
		if (!end || end == limit || *end || parsed > 10'000'000)
			fatalerror("invalid MOTRONIC_XDATA_EVENT_LIMIT=%s\n", limit);
		m_event_limit = parsed;
	}
	if (const char *trace = std::getenv("MOTRONIC_XDATA_TRACE_EVENTS"))
	{
		if (std::strcmp(trace, "0") && std::strcmp(trace, "1"))
			fatalerror("invalid MOTRONIC_XDATA_TRACE_EVENTS=%s\n", trace);
		m_trace_events = !std::strcmp(trace, "1");
	}
	const char *reset = std::getenv("MOTRONIC_XRAM_RESET");
	if (!reset || !std::strcmp(reset, "unknown"))
		m_reset_policy = storage_reset::UNKNOWN;
	else if (!std::strcmp(reset, "zero"))
		m_reset_policy = storage_reset::ZERO;
	else if (!std::strcmp(reset, "ff"))
		m_reset_policy = storage_reset::ONES;
	else if (!std::strcmp(reset, "preserve"))
		m_reset_policy = storage_reset::PRESERVE;
	else
		fatalerror("invalid MOTRONIC_XRAM_RESET=%s\n", reset);

	const char *policy = std::getenv("MOTRONIC_UNKNOWN_POLICY");
	if (!policy || !std::strcmp(policy, "stop"))
		m_policy = unknown_policy::STOP;
	else if (!std::strcmp(policy, "value"))
		m_policy = unknown_policy::VALUE;
	else
		fatalerror("invalid MOTRONIC_UNKNOWN_POLICY=%s\n", policy);
	if (m_policy == unknown_policy::VALUE)
	{
		const char *value = std::getenv("MOTRONIC_UNKNOWN_VALUE");
		if (!value)
			fatalerror("value policy requires MOTRONIC_UNKNOWN_VALUE\n");
		char *end = nullptr;
		const unsigned long parsed = std::strtoul(value, &end, 16);
		if (!end || *end || parsed > 0xff)
			fatalerror("invalid MOTRONIC_UNKNOWN_VALUE=%s\n", value);
		m_unknown_value = u8(parsed);
	}
	parse_inputs(std::getenv("MOTRONIC_INPUTS"));
	const char *scenario = std::getenv("MOTRONIC_SIGNAL_SCENARIO");
	const char *script = std::getenv("MOTRONIC_SIGNAL_SCRIPT");
	std::string signal_error;
	if (!m_signals.configure(
			scenario ? scenario : "off",
			script ? script : "",
			signal_error))
	{
		fatalerror(
				"invalid board-I/O signal configuration: %s\n",
				signal_error.c_str());
	}
	if (const char *stop = std::getenv("MOTRONIC_STOP_AFTER_TAINT"))
	{
		if (std::strcmp(stop, "0") && std::strcmp(stop, "1"))
			fatalerror("invalid MOTRONIC_STOP_AFTER_TAINT=%s\n", stop);
		m_stop_after_taint = !std::strcmp(stop, "1");
	}
	m_configured = true;
}

void motronic175_xdata_device::device_start()
{
	configure();
	save_item(NAME(m_storage));
	save_item(NAME(m_storage_known));
	save_item(NAME(m_output_latches));
	save_item(NAME(m_output_written));
	save_item(NAME(m_cycle));
	logerror(
			"XMODEL reset=%u unknown_policy=%u unknown_value=%02x "
			"configured_inputs=%u output_readback=disabled stop_after_taint=%u "
			"trace_events=%u event_limit=%llu\n",
			unsigned(m_reset_policy),
			unsigned(m_policy),
			m_unknown_value,
			unsigned(std::count(
					m_input_configured.begin(), m_input_configured.end(), u8(1))),
			m_stop_after_taint ? 1 : 0,
			m_trace_events ? 1 : 0,
			m_event_limit);
}

void motronic175_xdata_device::device_reset()
{
	if (!m_configured)
		fatalerror("XDATA reset before configuration\n");
	if (m_reset_policy == storage_reset::ZERO)
	{
		m_storage.fill(0);
		m_storage_known.fill(1);
	}
	else if (m_reset_policy == storage_reset::ONES)
	{
		m_storage.fill(0xff);
		m_storage_known.fill(1);
	}
	else if (m_reset_policy == storage_reset::UNKNOWN)
	{
		m_storage.fill(0);
		m_storage_known.fill(0);
	}
	m_output_written.fill(0);
	m_seen_reads.reset();
	m_seen_writes.reset();
	m_events = 0;
	m_unknown_reads = 0;
	m_cycle = 0;
	m_instruction_pc = 0;
	m_first_unknown_address = 0xffff;
	m_first_unknown_pc = 0xffff;
	m_taint_address = 0xffff;
	m_taint_branch = 0xffff;
	m_taint_read_pc = 0xffff;
	m_taint_value = 0;
	m_overflow = false;
	m_reported = false;
	m_stop_requested = false;
	m_taint_branch_seen = false;
}
