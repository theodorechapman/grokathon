// license:BSD-3-Clause
// Runtime validation driver for the Motronic SAB80C535/SAB80C515 proof.

#include "emu.h"
#include "cpu/mcs51/sab80c535.h"
namespace {

class motronic_validation_state : public driver_device
{
public:
	motronic_validation_state(const machine_config &mconfig, device_type type, const char *tag)
		: driver_device(mconfig, type, tag)
		, m_maincpu(*this, "maincpu")
	{
	}

	void motronicvalid(machine_config &config);
	void motronicstim(machine_config &config);

protected:
	virtual void machine_start() override ATTR_COLD;

private:
	void configure_cpu(machine_config &config);
	void canonical_code_map(address_map &map) ATTR_COLD;
	void canonical_xdata_map(address_map &map) ATTR_COLD;
	void stimulus_code_map(address_map &map) ATTR_COLD;
	void stimulus_xdata_map(address_map &map) ATTR_COLD;
	void install_trace_taps();
	void log_access(char const *space, char const *access, offs_t address, u8 data);
	void log_input(char const *interface_name, int state);
	void p1_w(u8 data);
	void p3_w(u8 data);
	u8 p3_r();
	u8 adc0_r();
	u8 adc1_r();
	TIMER_CALLBACK_MEMBER(stop_probe);
	TIMER_CALLBACK_MEMBER(assert_ext0);
	TIMER_CALLBACK_MEMBER(clear_ext0);
	TIMER_CALLBACK_MEMBER(step_uart_rx);

	required_device<sab80c535_device> m_maincpu;
	memory_passthrough_handler m_sfr_read_tap;
	memory_passthrough_handler m_sfr_write_tap;
	memory_passthrough_handler m_xdata_read_tap;
	memory_passthrough_handler m_xdata_write_tap;
	emu_timer *m_stop_timer = nullptr;
	emu_timer *m_ext0_timer = nullptr;
	emu_timer *m_ext0_clear_timer = nullptr;
	emu_timer *m_uart_rx_timer = nullptr;
	bool m_stimulus = false;
	u8 m_p3_input = 0xff;
	unsigned m_uart_step = 0;
};

void motronic_validation_state::canonical_code_map(address_map &map)
{
	map(0x0000, 0x9fff).rom().region("maincpu", 0);
}

void motronic_validation_state::canonical_xdata_map(address_map &map)
{
	// Preserve the baseline proof: only these two storage latches are backed.
	map(0xa040, 0xa041).ram();
}

void motronic_validation_state::stimulus_code_map(address_map &map)
{
	map(0x0000, 0x0fff).rom().region("maincpu", 0);
}

void motronic_validation_state::stimulus_xdata_map(address_map &map)
{
	// Surrogate test-firmware observation RAM, not a Bosch ASIC model.
	map(0xa000, 0xa1ff).ram();
}

void motronic_validation_state::log_access(
		char const *space, char const *access, offs_t address, u8 data)
{
	logerror(
			"EVT {\"kind\":\"access\",\"space\":\"%s\",\"access\":\"%s\","
			"\"cycles\":%llu,\"pc\":\"%04X\",\"address\":\"%04X\",\"data\":\"%02X\"}\n",
			space,
			access,
			static_cast<unsigned long long>(m_maincpu->total_cycles()),
			m_maincpu->pc(),
			unsigned(address),
			data);
}

void motronic_validation_state::log_input(char const *interface_name, int state)
{
	logerror(
			"EVT {\"kind\":\"input\",\"interface\":\"%s\",\"cycles\":%llu,"
			"\"pc\":\"%04X\",\"state\":%d}\n",
			interface_name,
			static_cast<unsigned long long>(m_maincpu->total_cycles()),
			m_maincpu->pc(),
			state);
}

void motronic_validation_state::install_trace_taps()
{
	address_space &sfr = m_maincpu->space(4);
	address_space &xdata = m_maincpu->space(AS_DATA);
	m_sfr_read_tap = sfr.install_read_tap(
			0x80, 0xff, "motronic_sfr_r",
			[this](offs_t offset, u8 &data, u8) {
				if (!machine().side_effects_disabled())
					log_access("sfr", "read", offset, data);
			});
	m_sfr_write_tap = sfr.install_write_tap(
			0x80, 0xff, "motronic_sfr_w",
			[this](offs_t offset, u8 &data, u8) {
				if (!machine().side_effects_disabled())
					log_access("sfr", "write", offset, data);
			});
	m_xdata_read_tap = xdata.install_read_tap(
			0x0000, 0xffff, "motronic_xdata_r",
			[this](offs_t offset, u8 &data, u8) {
				if (!machine().side_effects_disabled())
					log_access("xdata", "read", offset, data);
			});
	m_xdata_write_tap = xdata.install_write_tap(
			0x0000, 0xffff, "motronic_xdata_w",
			[this](offs_t offset, u8 &data, u8) {
				if (!machine().side_effects_disabled())
					log_access("xdata", "write", offset, data);
			});
}

void motronic_validation_state::machine_start()
{
	install_trace_taps();
	m_stop_timer = timer_alloc(FUNC(motronic_validation_state::stop_probe), this);
	m_stop_timer->adjust(attotime::from_usec(m_stimulus ? 2'500 : 50));
	logerror(
			"EVT {\"kind\":\"run\",\"profile\":\"%s\",\"runtime\":true,"
			"\"bound_us\":%d}\n",
			m_stimulus ? "surrogate-stimulus" : "canonical-reset",
			m_stimulus ? 2'500 : 50);
	if (m_stimulus)
	{
		m_ext0_timer = timer_alloc(FUNC(motronic_validation_state::assert_ext0), this);
		m_ext0_clear_timer = timer_alloc(FUNC(motronic_validation_state::clear_ext0), this);
		m_uart_rx_timer = timer_alloc(FUNC(motronic_validation_state::step_uart_rx), this);
		m_ext0_timer->adjust(attotime::from_usec(500));
		m_uart_rx_timer->adjust(attotime::from_usec(1'100));
	}
}

void motronic_validation_state::p1_w(u8 data)
{
	log_access("port", "write", 1, data);
}

void motronic_validation_state::p3_w(u8 data)
{
	log_access("port", "write", 3, data);
}

u8 motronic_validation_state::p3_r()
{
	return m_p3_input;
}

u8 motronic_validation_state::adc0_r()
{
	log_input("adc0-callback", 0x12);
	return 0x12;
}

u8 motronic_validation_state::adc1_r()
{
	log_input("adc1-callback", 0x34);
	return 0x34;
}

TIMER_CALLBACK_MEMBER(motronic_validation_state::stop_probe)
{
	machine().schedule_exit();
}

TIMER_CALLBACK_MEMBER(motronic_validation_state::assert_ext0)
{
	m_maincpu->set_input_line(MCS51_INT0_LINE, ASSERT_LINE);
	log_input("generic-int0", 1);
	m_ext0_clear_timer->adjust(attotime::from_usec(12));
}

TIMER_CALLBACK_MEMBER(motronic_validation_state::clear_ext0)
{
	m_maincpu->set_input_line(MCS51_INT0_LINE, CLEAR_LINE);
	log_input("generic-int0", 0);
}

TIMER_CALLBACK_MEMBER(motronic_validation_state::step_uart_rx)
{
	static constexpr u8 states[] = { 0, 0, 0, 1, 1, 1, 1, 0, 0, 1 };
	m_p3_input = (m_p3_input & 0xfe) | states[m_uart_step];
	log_input("generic-uart-rx", states[m_uart_step]);
	if (++m_uart_step < std::size(states))
		m_uart_rx_timer->adjust(attotime::from_usec(96));
}

void motronic_validation_state::configure_cpu(machine_config &config)
{
	SAB80C535(config, m_maincpu, XTAL(12'000'000));
	m_maincpu->port_in_cb<3>().set(FUNC(motronic_validation_state::p3_r));
	m_maincpu->port_out_cb<1>().set(FUNC(motronic_validation_state::p1_w));
	m_maincpu->port_out_cb<3>().set(FUNC(motronic_validation_state::p3_w));
	m_maincpu->an0_func().set(FUNC(motronic_validation_state::adc0_r));
	m_maincpu->an1_func().set(FUNC(motronic_validation_state::adc1_r));
}

void motronic_validation_state::motronicvalid(machine_config &config)
{
	configure_cpu(config);
	m_maincpu->set_addrmap(AS_PROGRAM, &motronic_validation_state::canonical_code_map);
	m_maincpu->set_addrmap(AS_DATA, &motronic_validation_state::canonical_xdata_map);
}

void motronic_validation_state::motronicstim(machine_config &config)
{
	m_stimulus = true;
	configure_cpu(config);
	m_maincpu->set_addrmap(AS_PROGRAM, &motronic_validation_state::stimulus_code_map);
	m_maincpu->set_addrmap(AS_DATA, &motronic_validation_state::stimulus_xdata_map);
}

static INPUT_PORTS_START(motronic_validation)
INPUT_PORTS_END

ROM_START(motronicvalid)
	ROM_REGION(0xa000, "maincpu", 0)
	ROM_LOAD("totalcombinedrom.bin", 0, 0xa000, CRC(be8680ec) SHA1(57504a65aea024cec06d4639d9e967cd325de272))
ROM_END

ROM_START(motronicstim)
	ROM_REGION(0x1000, "maincpu", ROMREGION_ERASEFF)
	ROM_LOAD("stimulus.bin", 0, 0x1000, CRC(9e8be8b7) SHA1(eda902c2ac2e66d843be185c7e90b371afda4b9f))
ROM_END

} // anonymous namespace

SYST(1992, motronicvalid, 0, 0, motronicvalid, motronic_validation, motronic_validation_state, empty_init, "Bosch", "Motronic canonical reset validation", MACHINE_NO_SOUND | MACHINE_NOT_WORKING)
SYST(2026, motronicstim, 0, 0, motronicstim, motronic_validation, motronic_validation_state, empty_init, "Validation fixture", "SAB80C535 peripheral stimulus surrogate", MACHINE_NO_SOUND | MACHINE_NOT_WORKING)
