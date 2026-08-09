// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "motronic175-state.h"
#include "motronic175-bridge-protocol.h"

void motronic175_state::bridge_send_frame()
{
	const motronic_bridge_counters counters{
			m_instructions,
			m_init_entries,
			m_supervisor_entries,
			m_foreground_entries,
			m_timer0_entries,
			m_timer1_entries,
			m_timer2_entries,
			m_capture_entries,
			m_vector0063_entries,
			m_vector006b_entries,
			m_xdata->unknown_reads()
	};
	std::string error;
	if (!m_bridge_socket.write_line(
			motronic175_bridge_protocol::frame(
					m_bridge_advance,
					m_bridge_telemetry,
					counters),
			error))
		bridge_fail(error);
}
