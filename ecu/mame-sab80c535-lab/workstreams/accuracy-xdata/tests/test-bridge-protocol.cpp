// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "motronic175-bridge-protocol.h"

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

bool parses(const std::string &json)
{
	motronic_bridge_command command;
	std::string error;
	return motronic175_bridge_protocol::parse(json, command, error);
}

void require_rejected(const std::string &json, const char *message)
{
	require(!parses(json), message);
}

} // anonymous namespace

int main()
{
	const std::string hello =
			R"({"schema":"motronic-bridge/v1","type":"hello"})";
	require(parses(hello), "valid hello");
	require_rejected(
			R"({"schema":"motronic-bridge/v2","type":"hello"})",
			"bad schema");
	require_rejected(
			R"({"schema":"motronic-bridge/v1\u0000hidden","type":"hello"})",
			"schema with embedded NUL");
	require_rejected(
			R"({"schema":"motronic-bridge/v1","type":"hello","extra":1})",
			"unknown hello field");
	require_rejected("{", "malformed JSON");

	const std::string valid =
			R"({"schema":"motronic-bridge/v1","type":"advance",)"
			R"("seq":0,"fromCycle":0,"toCycle":100,"events":[)"
			R"({"cycle":0,"kind":"xdata","address":41024,"value":1},)"
			R"({"cycle":1,"kind":"adc","channel":7,"value":127},)"
			R"({"cycle":2,"kind":"port","port":3,"value":254},)"
			R"({"cycle":99,"kind":"cc0","state":0}]})";
	motronic_bridge_command command;
	std::string error;
	require(
			motronic175_bridge_protocol::parse(valid, command, error),
			"valid advance parses");
	require(
			motronic175_bridge_protocol::validate_advance(
					command, 0, 0, error),
			"valid advance validates");
	require(command.events.size() == 4, "all event kinds retained");

	command.seq = 1;
	error.clear();
	require(
			!motronic175_bridge_protocol::validate_advance(
					command, 0, 0, error),
			"sequence mismatch");
	command.seq = 0;
	command.from_cycle = 1;
	error.clear();
	require(
			!motronic175_bridge_protocol::validate_advance(
					command, 0, 0, error),
			"cycle gap");
	command.from_cycle = 0;
	command.events[3].cycle = 100;
	error.clear();
	require(
			!motronic175_bridge_protocol::validate_advance(
					command, 0, 0, error),
			"event at boundary");
	command.events[3].cycle = 1;
	error.clear();
	require(
			!motronic175_bridge_protocol::validate_advance(
					command, 0, 0, error),
			"nonmonotonic event");

	require_rejected(
			R"({"schema":"motronic-bridge/v1","type":"advance",)"
			R"("seq":0,"fromCycle":0,"toCycle":1,"events":[)"
			R"({"cycle":0,"kind":"xdata","address":40959,"value":0}]})",
			"xdata below A000");
	require_rejected(
			R"({"schema":"motronic-bridge/v1","type":"advance",)"
			R"("seq":0,"fromCycle":0,"toCycle":1,"events":[)"
			R"({"cycle":0,"kind":"adc","channel":0,"value":128}]})",
			"ADC callback range");
	require_rejected(
			R"({"schema":"motronic-bridge/v1","type":"advance",)"
			R"("seq":0,"fromCycle":0,"toCycle":1,"events":[)"
			R"({"cycle":0,"kind":"port","port":4,"value":0}]})",
			"invalid port");
	require_rejected(
			R"({"schema":"motronic-bridge/v1","type":"advance",)"
			R"("seq":0,"fromCycle":0,"toCycle":1,"events":[)"
			R"({"cycle":0,"kind":"cc0","state":2}]})",
			"invalid CC0 state");
	require_rejected(
			R"({"schema":"motronic-bridge/v1","type":"advance",)"
			R"("seq":0,"fromCycle":0,"toCycle":1,"events":[],"extra":0})",
			"unknown advance field");
	require_rejected(
			R"({"schema":"motronic-bridge/v1","type":"advance",)"
			R"("seq":0,"seq":0,"toCycle":1,"events":[]})",
			"duplicate advance field");

	std::cout << "PASS: bridge protocol parser and validation\n";
	return 0;
}
