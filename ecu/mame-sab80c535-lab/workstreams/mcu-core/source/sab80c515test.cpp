// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "emu.h"
#include "cpu/mcs51/sab80c535.h"

namespace {

class sab80c515test_state : public driver_device
{
public:
	sab80c515test_state(const machine_config &mconfig, device_type type, const char *tag)
		: driver_device(mconfig, type, tag)
		, m_maincpu(*this, "maincpu")
	{
	}

	void sab80c515test(machine_config &config);

protected:
	virtual void machine_start() override ATTR_COLD;

private:
	TIMER_CALLBACK_MEMBER(timeout);

	void code_map(address_map &map) ATTR_COLD;
	void result_w(u8 data);
	void xdata_map(address_map &map) ATTR_COLD;

	required_device<sab80c535_device> m_maincpu;
	emu_timer *m_timeout = nullptr;
};

void sab80c515test_state::code_map(address_map &map)
{
	map(0x0000, 0x07ff).rom().region("maincpu", 0);
}

void sab80c515test_state::xdata_map(address_map &map)
{
	map(0xff00, 0xff00).w(FUNC(sab80c515test_state::result_w));
}

void sab80c515test_state::result_w(u8 data)
{
	logerror("SAB515TEST result=%02X cycles=%llu pc=%04X\n",
			data,
			static_cast<unsigned long long>(m_maincpu->total_cycles()),
			unsigned(m_maincpu->pc()));
	m_timeout->adjust(attotime::never);
	machine().schedule_exit();
}

void sab80c515test_state::machine_start()
{
	m_timeout = timer_alloc(FUNC(sab80c515test_state::timeout), this);
	m_timeout->adjust(attotime::from_msec(10));
}

TIMER_CALLBACK_MEMBER(sab80c515test_state::timeout)
{
	logerror("SAB515TEST timeout cycles=%llu pc=%04X\n",
			static_cast<unsigned long long>(m_maincpu->total_cycles()),
			unsigned(m_maincpu->pc()));
	machine().schedule_exit();
}

static INPUT_PORTS_START(sab80c515test)
INPUT_PORTS_END

void sab80c515test_state::sab80c515test(machine_config &config)
{
	SAB80C535(config, m_maincpu, XTAL(12'000'000));
	m_maincpu->set_addrmap(AS_PROGRAM, &sab80c515test_state::code_map);
	m_maincpu->set_addrmap(AS_DATA, &sab80c515test_state::xdata_map);
	m_maincpu->port_in_cb<6>().set_constant(0xa5);
	m_maincpu->an0_func().set_constant(0x29);
}

ROM_START(sab515test)
	ROM_REGION(0x0800, "maincpu", 0)
	ROM_LOAD(
			"sab80c515-test.bin",
			0x0000,
			0x0800,
			CRC(53d3686f) SHA1(97987d08518f285b0e205f2ceb6fc09ea9d9a522))
ROM_END

} // anonymous namespace

SYST(2026, sab515test, 0, 0, sab80c515test, sab80c515test, sab80c515test_state, empty_init, "MAME", "SAB80C515 peripheral self-test", MACHINE_NO_SOUND | MACHINE_NOT_WORKING)
