// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "motronic175-bridge-protocol.h"

#include <rapidjson/stringbuffer.h>
#include <rapidjson/writer.h>

namespace {

using frame_writer = rapidjson::Writer<rapidjson::StringBuffer>;

void write_identity(frame_writer &writer, const char *type)
{
	writer.StartObject();
	writer.Key("schema"); writer.String(MOTRONIC_BRIDGE_SCHEMA);
	writer.Key("type"); writer.String(type);
}

void write_telemetry(
		frame_writer &writer,
		const motronic_bridge_telemetry &event)
{
	writer.StartObject();
	writer.Key("cycle");
	writer.Uint64(event.cycle);
	switch (event.kind)
	{
	case motronic_bridge_telemetry_kind::P1:
		writer.Key("kind"); writer.String("p1");
		writer.Key("bit"); writer.Uint(event.selector);
		writer.Key("state"); writer.Uint(event.value);
		break;
	case motronic_bridge_telemetry_kind::XDATA_WRITE:
		writer.Key("kind"); writer.String("xdata-write");
		writer.Key("address"); writer.Uint(event.address);
		writer.Key("value"); writer.Uint(event.value);
		break;
	case motronic_bridge_telemetry_kind::SFR_WRITE:
		writer.Key("kind"); writer.String("sfr-write");
		writer.Key("address"); writer.Uint(event.address);
		writer.Key("value"); writer.Uint(event.value);
		break;
	}
	writer.EndObject();
}

void write_counters(
		frame_writer &writer,
		const motronic_bridge_counters &counters)
{
	writer.Key("counters");
	writer.StartObject();
	writer.Key("instructions"); writer.Uint64(counters.instructions);
	writer.Key("init"); writer.Uint(counters.init);
	writer.Key("supervisor"); writer.Uint(counters.supervisor);
	writer.Key("foreground"); writer.Uint(counters.foreground);
	writer.Key("timer0"); writer.Uint(counters.timer0);
	writer.Key("timer1"); writer.Uint(counters.timer1);
	writer.Key("timer2"); writer.Uint(counters.timer2);
	writer.Key("capture"); writer.Uint(counters.capture);
	writer.Key("vector0063"); writer.Uint(counters.vector0063);
	writer.Key("vector006b"); writer.Uint(counters.vector006b);
	writer.Key("unknownXdataReads"); writer.Uint64(counters.unknown_xdata_reads);
	writer.EndObject();
}

} // anonymous namespace

std::string motronic175_bridge_protocol::frame(
		const motronic_bridge_command &advance,
		const std::vector<motronic_bridge_telemetry> &telemetry,
		const motronic_bridge_counters &counters)
{
	rapidjson::StringBuffer buffer;
	frame_writer writer(buffer);
	write_identity(writer, "frame");
	writer.Key("seq"); writer.Uint64(advance.seq);
	writer.Key("fromCycle"); writer.Uint64(advance.from_cycle);
	writer.Key("toCycle"); writer.Uint64(advance.to_cycle);
	writer.Key("cycle"); writer.Uint64(advance.to_cycle);
	writer.Key("telemetry");
	writer.StartArray();
	for (const motronic_bridge_telemetry &event : telemetry)
		write_telemetry(writer, event);
	writer.EndArray();
	write_counters(writer, counters);
	writer.EndObject();
	return buffer.GetString();
}

std::string motronic175_bridge_protocol::ready(std::uint64_t cycle)
{
	rapidjson::StringBuffer buffer;
	frame_writer writer(buffer);
	write_identity(writer, "ready");
	writer.Key("cycle"); writer.Uint64(cycle);
	writer.Key("nextSeq"); writer.Uint64(0);
	writer.Key("romSha256");
	writer.String("e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33");
	writer.Key("mameCommit");
	writer.String("a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e");
	writer.Key("limits"); writer.StartObject();
	writer.Key("maxEvents"); writer.Uint64(MOTRONIC_BRIDGE_MAX_EVENTS);
	writer.Key("maxBatchCycles"); writer.Uint64(MOTRONIC_BRIDGE_MAX_BATCH_CYCLES);
	writer.EndObject(); writer.EndObject();
	return buffer.GetString();
}

std::string motronic175_bridge_protocol::error_frame(std::string_view message)
{
	rapidjson::StringBuffer buffer;
	frame_writer writer(buffer);
	write_identity(writer, "error");
	writer.Key("fatal"); writer.Bool(true);
	writer.Key("message"); writer.String(message.data(), message.size());
	writer.EndObject();
	return buffer.GetString();
}
