// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "motronic175-state.h"

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

u8 motronic175_state::p3_r()
{
	return (m_xdata->read_port(3) & 0xfe) | (m_kw71->p3_r() & 0x01);
}

void motronic175_state::p3_w(u8 data)
{
	m_kw71->p3_w(data);
}

u8 motronic175_state::p5_r()
{
	return m_xdata->read_port(5);
}

u8 motronic175_state::p6_r()
{
	return m_xdata->read_port(6);
}

static INPUT_PORTS_START(motronic175)
INPUT_PORTS_END

void motronic175_state::motronic175(machine_config &config)
{
	SAB80C535(config, m_maincpu, XTAL(12'000'000));
	m_maincpu->set_addrmap(AS_PROGRAM, &motronic175_state::code_map);
	m_maincpu->set_addrmap(AS_DATA, &motronic175_state::xdata_map);
	m_maincpu->an0_func().set(FUNC(motronic175_state::adc0_r));
	m_maincpu->an1_func().set(FUNC(motronic175_state::adc1_r));
	m_maincpu->an2_func().set(FUNC(motronic175_state::adc2_r));
	m_maincpu->an3_func().set(FUNC(motronic175_state::adc3_r));
	m_maincpu->an4_func().set(FUNC(motronic175_state::adc4_r));
	m_maincpu->an5_func().set(FUNC(motronic175_state::adc5_r));
	m_maincpu->an6_func().set(FUNC(motronic175_state::adc6_r));
	m_maincpu->an7_func().set(FUNC(motronic175_state::adc7_r));
	m_maincpu->ccu_write_cb().set(FUNC(motronic175_state::ccu_w));
	m_maincpu->instruction_cb().set(FUNC(motronic175_state::instruction));
	m_maincpu->port_in_cb<3>().set(FUNC(motronic175_state::p3_r));
	m_maincpu->port_in_cb<5>().set(FUNC(motronic175_state::p5_r));
	m_maincpu->port_in_cb<6>().set(FUNC(motronic175_state::p6_r));
	m_maincpu->port_out_cb<0>().set_nop();
	m_maincpu->port_out_cb<1>().set(FUNC(motronic175_state::p1_w));
	m_maincpu->port_out_cb<2>().set_nop();
	m_maincpu->port_out_cb<3>().set(FUNC(motronic175_state::p3_w));
	m_maincpu->port_out_cb<4>().set_nop();
	m_maincpu->port_out_cb<5>().set_nop();
	MOTRONIC175_XDATA(config, m_xdata, 0);
	m_xdata->output_cb().set(FUNC(motronic175_state::xdata_output_w));
	MOTRONIC175_KW71(config, m_kw71, 0);
}

ROM_START(motronic175)
	ROM_REGION(0xa000, "maincpu", 0)
	ROM_LOAD(
			"totalcombinedrom.bin",
			0x0000,
			0xa000,
			CRC(be8680ec) SHA1(57504a65aea024cec06d4639d9e967cd325de272))
ROM_END

SYST(
		1992,
		motronic175,
		0,
		0,
		motronic175,
		motronic175,
		motronic175_state,
		empty_init,
		"Bosch",
		"Motronic M1.7 evidence-bounded signal lab",
		MACHINE_NO_SOUND | MACHINE_NOT_WORKING)
