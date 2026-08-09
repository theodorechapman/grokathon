// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "motronic175-bridge-protocol.h"

#include <rapidjson/document.h>

#include <initializer_list>
#include <limits>
namespace {

using json_value = rapidjson::Value;

std::string_view string_value(const json_value &value)
{
	return {value.GetString(), value.GetStringLength()};
}

bool has_fields(
		const json_value &value,
		std::initializer_list<const char *> allowed)
{
	if (!value.IsObject() || value.MemberCount() != allowed.size())
		return false;
	for (const char *name : allowed)
	{
		unsigned count = 0;
		for (const auto &member : value.GetObject())
			count += string_value(member.name) == name;
		if (count != 1)
			return false;
	}
	return true;
}

bool unsigned_value(
		const json_value &object,
		const char *name,
		std::uint64_t maximum,
		std::uint64_t &result)
{
	if (!object.HasMember(name) || !object[name].IsUint64())
		return false;
	result = object[name].GetUint64();
	return result <= maximum;
}

bool parse_event(
		const json_value &source,
		motronic_bridge_event &event,
		std::string &error)
{
	std::uint64_t cycle = 0;
	if (!source.IsObject() || !unsigned_value(source, "cycle", UINT64_MAX, cycle)
			|| !source.HasMember("kind") || !source["kind"].IsString())
	{
		error = "event requires integer cycle and string kind";
		return false;
	}
	event.cycle = cycle;
	const std::string_view kind = string_value(source["kind"]);
	std::uint64_t field = 0;
	if (kind == "xdata" && has_fields(source, {"cycle", "kind", "address", "value"})
			&& unsigned_value(source, "address", 0xffff, field))
	{
		event.kind = motronic_bridge_event_kind::XDATA;
		event.address = field;
		if (event.address < 0xa000 || event.address > 0xa0ff
				|| !unsigned_value(source, "value", 0xff, field))
			error = "xdata event requires A000-A0FF address and byte value";
		else
			event.value = field;
	}
	else if (kind == "adc" && has_fields(source, {"cycle", "kind", "channel", "value"})
			&& unsigned_value(source, "channel", 7, field))
	{
		event.kind = motronic_bridge_event_kind::ADC;
		event.selector = field;
		if (!unsigned_value(source, "value", 127, field))
			error = "adc event requires channel 0..7 and callback code 0..127";
		else
			event.value = field;
	}
	else if (kind == "port" && has_fields(source, {"cycle", "kind", "port", "value"})
			&& unsigned_value(source, "port", 6, field))
	{
		event.kind = motronic_bridge_event_kind::PORT;
		event.selector = field;
		if ((event.selector != 3 && event.selector != 5 && event.selector != 6)
				|| !unsigned_value(source, "value", 0xff, field))
			error = "port event requires port 3, 5, or 6 and byte value";
		else
			event.value = field;
	}
	else if (kind == "cc0" && has_fields(source, {"cycle", "kind", "state"})
			&& unsigned_value(source, "state", 1, field))
	{
		event.kind = motronic_bridge_event_kind::CC0;
		event.value = field;
	}
	else if (error.empty())
		error = "unknown event kind, field, or out-of-range value";
	return error.empty();
}

} // anonymous namespace

bool motronic175_bridge_protocol::parse(
		std::string_view line,
		motronic_bridge_command &command,
		std::string &error)
{
	error.clear();
	rapidjson::Document document;
	document.Parse(line.data(), line.size());
	if (document.HasParseError() || !document.IsObject())
	{
		error = "command is not one valid JSON object";
		return false;
	}
	if (!document.HasMember("schema") || !document["schema"].IsString()
			|| string_value(document["schema"]) != MOTRONIC_BRIDGE_SCHEMA
			|| !document.HasMember("type") || !document["type"].IsString())
	{
		error = "command has invalid schema or type";
		return false;
	}
	const std::string_view type = string_value(document["type"]);
	if (type == "hello" || type == "shutdown")
	{
		if (!has_fields(document, {"schema", "type"}))
		{
			error = type == "hello"
					? "hello contains unknown or missing fields"
					: "shutdown contains unknown or missing fields";
			return false;
		}
		command = {};
		command.kind = type == "hello"
				? motronic_bridge_command_kind::HELLO
				: motronic_bridge_command_kind::SHUTDOWN;
		return true;
	}
	if (type != "advance"
			|| !has_fields(
					document,
					{"schema", "type", "seq", "fromCycle", "toCycle", "events"}))
	{
		error = "unknown command type or advance fields";
		return false;
	}

	std::uint64_t seq = 0;
	std::uint64_t from = 0;
	std::uint64_t to = 0;
	if (!unsigned_value(document, "seq", UINT64_MAX, seq)
			|| !unsigned_value(document, "fromCycle", UINT64_MAX, from)
			|| !unsigned_value(document, "toCycle", UINT64_MAX, to)
			|| !document["events"].IsArray()
			|| document["events"].Size() > MOTRONIC_BRIDGE_MAX_EVENTS)
	{
		error = "advance integer or event-array field is invalid";
		return false;
	}
	command = {};
	command.kind = motronic_bridge_command_kind::ADVANCE;
	command.seq = seq;
	command.from_cycle = from;
	command.to_cycle = to;
	command.events.reserve(document["events"].Size());
	for (const json_value &source : document["events"].GetArray())
	{
		motronic_bridge_event event;
		if (!parse_event(source, event, error))
			return false;
		command.events.push_back(event);
	}
	return true;
}

bool motronic175_bridge_protocol::validate_advance(
		const motronic_bridge_command &command,
		std::uint64_t expected_seq,
		std::uint64_t current_cycle,
		std::string &error)
{
	error.clear();
	if (command.kind != motronic_bridge_command_kind::ADVANCE)
		error = "expected advance command";
	else if (command.seq != expected_seq)
		error = "advance sequence mismatch";
	else if (command.seq == std::numeric_limits<std::uint64_t>::max())
		error = "advance sequence overflow";
	else if (command.from_cycle != current_cycle)
		error = "advance cycle gap or overlap";
	else if (command.to_cycle <= command.from_cycle)
		error = "advance cycle range must increase";
	else if (command.to_cycle - command.from_cycle
			> MOTRONIC_BRIDGE_MAX_BATCH_CYCLES)
		error = "advance cycle range exceeds limit";
	std::uint64_t previous = command.from_cycle;
	for (const motronic_bridge_event &event : command.events)
	{
		if (!error.empty())
			break;
		if (event.cycle < command.from_cycle || event.cycle >= command.to_cycle)
			error = "event cycle is outside half-open advance range";
		else if (event.cycle < previous)
			error = "event cycles are not ordered";
		previous = event.cycle;
	}
	return error.empty();
}
