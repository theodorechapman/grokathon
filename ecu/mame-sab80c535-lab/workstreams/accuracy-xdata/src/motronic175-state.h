// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#ifndef MAME_SKELETON_MOTRONIC175_STATE_H
#define MAME_SKELETON_MOTRONIC175_STATE_H

#pragma once

#include "emu.h"
#include "cpu/mcs51/sab80c535.h"
#include "motronic175-adc.h"
#include "motronic175-bridge-socket.h"
#include "motronic175-bridge-types.h"
#include "motronic175-crank-trace.h"
#include "motronic175-kw71.h"
#include "motronic175-xdata.h"

#include <string>
#include <vector>

class motronic175_state : public driver_device
{
public:
	motronic175_state(
			const machine_config &mconfig,
			device_type type,
			const char *tag)
		: driver_device(mconfig, type, tag)
		, m_maincpu(*this, "maincpu")
		, m_xdata(*this, "xdata")
		, m_kw71(*this, "kw71")
	{
	}

	void motronic175(machine_config &config);

protected:
	virtual void machine_start() override ATTR_COLD;

private:
	TIMER_CALLBACK_MEMBER(bridge_boundary);
	TIMER_CALLBACK_MEMBER(bridge_event);
	TIMER_CALLBACK_MEMBER(crank_transition);
	TIMER_CALLBACK_MEMBER(timeout);
	u8 adc_sample(unsigned channel);
	u8 adc0_r();
	u8 adc1_r();
	u8 adc2_r();
	u8 adc3_r();
	u8 adc4_r();
	u8 adc5_r();
	u8 adc6_r();
	u8 adc7_r();
	void code_map(address_map &map) ATTR_COLD;
	void bridge_apply_event(const motronic_bridge_event &event);
	void bridge_apply_events_at(u64 cycle);
	[[noreturn]] void bridge_fail(const std::string &message);
	motronic_bridge_command bridge_read_command();
	void bridge_record(
			motronic_bridge_telemetry_kind kind,
			u64 cycle,
			u16 address,
			u8 selector,
			u8 value);
	void bridge_send_frame();
	void bridge_start(const char *path);
	void bridge_wait_for_advance();
	void ccu_w(offs_t offset, u8 data);
	void instruction(u16 pc);
	void p1_w(u8 data);
	u8 p3_r();
	void p3_w(u8 data);
	u8 p5_r();
	u8 p6_r();
	void report();
	void request_stop(const char *reason);
	void xdata_output_w(offs_t offset, u8 data);
	void xdata_map(address_map &map) ATTR_COLD;

	motronic175_adc_provider m_adc;
	motronic175_bridge_socket m_bridge_socket;
	required_device<sab80c535_device> m_maincpu;
	required_device<motronic175_xdata_device> m_xdata;
	required_device<motronic175_kw71_device> m_kw71;
	emu_timer *m_timeout = nullptr;
	emu_timer *m_crank_timer = nullptr;
	emu_timer *m_bridge_boundary_timer = nullptr;
	emu_timer *m_bridge_event_timer = nullptr;
	std::vector<motronic_crank_transition> m_crank_trace;
	motronic_bridge_command m_bridge_advance;
	std::vector<motronic_bridge_telemetry> m_bridge_telemetry;
	u64 m_instruction_limit = 200'000;
	u64 m_timeout_ms = 50;
	u64 m_crank_index = 0;
	u64 m_bridge_cycle = 0;
	u64 m_bridge_event_index = 0;
	u64 m_bridge_next_seq = 0;
	u64 m_instructions = 0;
	u64 m_pc_hash = 0xcbf29ce484222325ULL;
	u64 m_p1_transitions = 0;
	u64 m_stop_cycle = 0;
	u16 m_deepest_pc = 0;
	u16 m_last_pc = 0;
	u16 m_startup_frontier = 0;
	unsigned m_capture_entries = 0;
	unsigned m_foreground_entries = 0;
	unsigned m_init_entries = 0;
	unsigned m_supervisor_entries = 0;
	unsigned m_timer0_entries = 0;
	unsigned m_timer1_entries = 0;
	unsigned m_timer2_entries = 0;
	unsigned m_vector0063_entries = 0;
	unsigned m_vector006b_entries = 0;
	u8 m_p1_last = 0xff;
	const char *m_reason = "external-stop";
	bool m_continue_foreground = false;
	bool m_bridge_batch_active = false;
	bool m_bridge_enabled = false;
	bool m_stopping = false;
};

#endif
