// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "emu.h"
#include "cpu/mcs51/sab80c535.h"
#include "motronic175-xdata.h"

namespace {

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
	{
	}

	void motronic175(machine_config &config);

protected:
	virtual void machine_start() override ATTR_COLD;

private:
	static constexpr u64 MAX_INSTRUCTIONS = 100'000;
	static constexpr unsigned TIMER2_STORM_LIMIT = 16;

	TIMER_CALLBACK_MEMBER(stop_probe);
	void code_map(address_map &map) ATTR_COLD;
	void instruction(u16 pc);
	void report();
	void request_stop(const char *reason);
	void xdata_map(address_map &map) ATTR_COLD;

	required_device<sab80c535_device> m_maincpu;
	required_device<motronic175_xdata_device> m_xdata;
	emu_timer *m_stop_timer = nullptr;
	u64 m_instructions = 0;
	u64 m_foreground_instruction = 0;
	u64 m_stop_cycle = 0;
	u16 m_deepest_pc = 0;
	u16 m_last_pc = 0;
	u16 m_startup_frontier = 0;
	unsigned m_init_entries = 0;
	unsigned m_foreground_entries = 0;
	unsigned m_timer2_entries = 0;
	const char *m_stop_reason = "timeout";
	bool m_stopping = false;
};

void motronic175_state::code_map(address_map &map)
{
	map(0x0000, 0x9fff).rom().region("maincpu", 0);
}

void motronic175_state::xdata_map(address_map &map)
{
	map(0x0000, 0xffff).rw(
			m_xdata,
			FUNC(motronic175_xdata_device::read),
			FUNC(motronic175_xdata_device::write));
}

void motronic175_state::machine_start()
{
	m_stop_timer = timer_alloc(FUNC(motronic175_state::stop_probe), this);
	m_stop_timer->adjust(attotime::from_seconds(2));
	machine().add_notifier(
			MACHINE_NOTIFY_EXIT,
			machine_notify_delegate(&motronic175_state::report, this));
}

void motronic175_state::report()
{
	m_xdata->report();
	logerror(
			"EXEC summary reason=%s instructions=%llu cycles=%llu exit_cycles=%llu "
			"deepest_pc=%04x last_pc=%04x startup_frontier=%04x "
			"init_entries=%u timer2_entries=%u foreground_entries=%u "
			"foreground_instruction=%llu\n",
			m_stop_reason,
			m_instructions,
			m_stop_cycle,
			m_maincpu->total_cycles(),
			m_deepest_pc,
			m_last_pc,
			m_startup_frontier,
			m_init_entries,
			m_timer2_entries,
			m_foreground_entries,
			m_foreground_instruction);
}

void motronic175_state::request_stop(const char *reason)
{
	if (m_stopping)
		return;
	m_stop_reason = reason;
	m_stop_cycle = m_maincpu->total_cycles();
	m_stopping = true;
	machine().schedule_exit();
}

void motronic175_state::instruction(u16 pc)
{
	++m_instructions;
	m_last_pc = pc;
	m_deepest_pc = std::max(m_deepest_pc, pc);
	m_xdata->begin_instruction(pc);
	if (pc >= 0x5c00 && pc <= 0x5d0f)
		m_startup_frontier = std::max(m_startup_frontier, pc);

	if (pc == 0x5c00)
		++m_init_entries;
	if (pc == 0x002b)
	{
		++m_timer2_entries;
		if (m_timer2_entries >= TIMER2_STORM_LIMIT)
			request_stop("timer2-interrupt-storm");
	}
	if (pc == 0x601a)
	{
		++m_foreground_entries;
		if (!m_foreground_instruction)
			m_foreground_instruction = m_instructions;
		request_stop("foreground");
	}
	if (m_instructions >= MAX_INSTRUCTIONS)
		request_stop("instruction-limit");
}

TIMER_CALLBACK_MEMBER(motronic175_state::stop_probe)
{
	request_stop("cycle-timeout");
}

static INPUT_PORTS_START(motronic175)
INPUT_PORTS_END

void motronic175_state::motronic175(machine_config &config)
{
	SAB80C535(config, m_maincpu, XTAL(12'000'000));
	m_maincpu->set_addrmap(AS_PROGRAM, &motronic175_state::code_map);
	m_maincpu->set_addrmap(AS_DATA, &motronic175_state::xdata_map);
	m_maincpu->instruction_cb().set(FUNC(motronic175_state::instruction));
	MOTRONIC175_XDATA(config, m_xdata, 0);
}

ROM_START(motronic175)
	ROM_REGION(0xa000, "maincpu", 0)
	ROM_LOAD(
			"totalcombinedrom.bin",
			0x0000,
			0xa000,
			CRC(be8680ec) SHA1(57504a65aea024cec06d4639d9e967cd325de272))
ROM_END

} // anonymous namespace

SYST(1992, motronic175, 0, 0, motronic175, motronic175, motronic175_state, empty_init, "Bosch", "Motronic M1.7 XDATA startup proof", MACHINE_NO_SOUND | MACHINE_NOT_WORKING)
