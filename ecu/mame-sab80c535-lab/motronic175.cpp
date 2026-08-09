// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "emu.h"
#include "cpu/mcs51/sab80c535.h"

namespace {

class motronic175_state : public driver_device
{
public:
	motronic175_state(const machine_config &mconfig, device_type type, const char *tag)
		: driver_device(mconfig, type, tag)
		, m_maincpu(*this, "maincpu")
	{
	}

	void motronic175(machine_config &config);

protected:
	virtual void machine_start() override ATTR_COLD;

private:
	TIMER_CALLBACK_MEMBER(stop_probe);

	void code_map(address_map &map) ATTR_COLD;
	void xdata_map(address_map &map) ATTR_COLD;

	required_device<sab80c535_device> m_maincpu;
	emu_timer *m_stop_timer = nullptr;
};

void motronic175_state::code_map(address_map &map)
{
	map(0x0000, 0x9fff).rom().region("maincpu", 0);
}

void motronic175_state::xdata_map(address_map &map)
{
	// Two proven firmware latches.  Their real Bosch ASIC semantics are unknown.
	map(0xa040, 0xa041).ram();
}

void motronic175_state::machine_start()
{
	m_stop_timer = timer_alloc(FUNC(motronic175_state::stop_probe), this);
	m_stop_timer->adjust(attotime::from_usec(50));
}

TIMER_CALLBACK_MEMBER(motronic175_state::stop_probe)
{
	machine().schedule_exit();
}

static INPUT_PORTS_START(motronic175)
INPUT_PORTS_END

void motronic175_state::motronic175(machine_config &config)
{
	SAB80C535(config, m_maincpu, XTAL(12'000'000));
	m_maincpu->set_addrmap(AS_PROGRAM, &motronic175_state::code_map);
	m_maincpu->set_addrmap(AS_DATA, &motronic175_state::xdata_map);
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

SYST(1992, motronic175, 0, 0, motronic175, motronic175, motronic175_state, empty_init, "Bosch", "Motronic M1.7 SAB80C515 firmware lab", MACHINE_NO_SOUND | MACHINE_NOT_WORKING)
