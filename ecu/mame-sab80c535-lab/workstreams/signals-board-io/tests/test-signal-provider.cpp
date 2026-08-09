// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "../src/motronic175-signal-provider.h"

#include <cstdlib>
#include <iostream>
#include <string>

namespace {

void require(bool condition, const char *message)
{
	if (!condition)
	{
		std::cerr << "FAIL: " << message << '\n';
		std::exit(1);
	}
}

motronic175_signal_provider configured(
		const char *scenario,
		const char *script = "")
{
	motronic175_signal_provider provider;
	std::string error;
	require(provider.configure(scenario, script, error), error.c_str());
	return provider;
}

void verify_scenarios()
{
	auto off = configured("off");
	require(!off.enabled(), "off scenario is enabled");

	auto key_on = configured("key-on");
	require(key_on.enabled(), "key-on scenario is disabled");
	require(key_on.read_xdata(0xa040, 4095) == 0x01, "key-on wait level");
	require(key_on.read_xdata(0xa040, 4096) == 0x00, "key-on release");
	require(key_on.read_xdata(0xa041, 5000) == 0x00, "key-on a041");
	require(key_on.read_port(5, 5000) == 0xff, "key-on p5");

	auto crank = configured("crank");
	require(crank.read_port(3, 8191) == 0xff, "crank p3 pre-window");
	require(crank.read_port(3, 8192) == 0xef, "crank p3 low-window");
	require(crank.read_port(3, 12288) == 0xff, "crank p3 recovery");

	for (const char *name : { "idle", "part-load", "wot", "overrun" })
	{
		auto provider = configured(name);
		require(provider.read_xdata(0xa040, 4095) == 0x41, "mode wait level");
		require(provider.read_xdata(0xa040, 4096) == 0x40, "mode release");
		require(provider.read_port(6, 9000) == 0xff, "mode p6");
	}

	auto fault = configured("fault-inputs");
	require(fault.read_xdata(0xa040, 100000) == 0x01, "fault stuck a040");
	require(fault.read_xdata(0xa041, 100000) == 0xff, "fault a041");
	require(fault.read_port(3, 100000) == 0xef, "fault p3");
	require(fault.read_port(5, 100000) == 0xe7, "fault p5");
	require(fault.read_port(6, 100000) == 0x00, "fault p6");
}

void verify_scripts()
{
	auto provider = configured(
			"idle",
			"100:a040=aa, 200:p5=7f, 5000:a040=55");
	require(provider.read_xdata(0xa040, 99) == 0x41, "script before override");
	require(provider.read_xdata(0xa040, 100) == 0xaa, "script first override");
	require(provider.read_xdata(0xa040, 4096) == 0x40, "later named event");
	require(provider.read_xdata(0xa040, 5000) == 0x55, "script later override");
	require(provider.read_port(5, 199) == 0xff, "script p5 before");
	require(provider.read_port(5, 200) == 0x7f, "script p5 after");
	require(provider.read_xdata(0xa041, 999) == 0x00, "cross-signal alias");
}

void verify_rejections()
{
	motronic175_signal_provider provider;
	std::string error;
	require(!provider.configure("missing", "", error), "unknown scenario accepted");
	require(!provider.configure("off", "1:p3=00", error), "off script accepted");
	require(!provider.configure("key-on", "bad", error), "bad grammar accepted");
	require(!provider.configure("key-on", "1:p4=00", error), "bad target accepted");
	require(!provider.configure("key-on", "1:p3=100", error), "wide byte accepted");
}

} // anonymous namespace

int main()
{
	verify_scenarios();
	verify_scripts();
	verify_rejections();
	std::cout << "PASS: deterministic signal provider scenarios and scripts\n";
	return 0;
}
