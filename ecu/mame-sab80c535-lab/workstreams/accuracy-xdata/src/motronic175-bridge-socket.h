// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#ifndef MAME_SKELETON_MOTRONIC175_BRIDGE_SOCKET_H
#define MAME_SKELETON_MOTRONIC175_BRIDGE_SOCKET_H

#pragma once

#include "osdfile.h"

#include <chrono>
#include <cstdint>
#include <string>
#include <string_view>

class motronic175_bridge_socket
{
public:
	static constexpr std::size_t MAX_LINE_BYTES = 256 * 1024;

	motronic175_bridge_socket() = default;
	~motronic175_bridge_socket();

	motronic175_bridge_socket(const motronic175_bridge_socket &) = delete;
	motronic175_bridge_socket &operator=(
			const motronic175_bridge_socket &) = delete;

	bool open(
			std::string_view path,
			std::uint64_t timeout_ms,
			std::string &error);
	bool read_line(std::string &line, std::string &error);
	bool write_line(std::string_view line, std::string &error);

private:
	bool timed_out(
			std::chrono::steady_clock::time_point start) const;

	osd_file::ptr m_file;
	std::string m_path;
	std::string m_pending;
	std::chrono::milliseconds m_timeout{5'000};
	bool m_connected = false;
};

#endif
