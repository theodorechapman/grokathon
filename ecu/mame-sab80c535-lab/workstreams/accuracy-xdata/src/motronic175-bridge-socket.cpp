// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#include "motronic175-bridge-socket.h"

#include <array>
#include <thread>

motronic175_bridge_socket::~motronic175_bridge_socket()
{
	m_file.reset();
	if (!m_path.empty())
		osd_file::remove(m_path);
}

bool motronic175_bridge_socket::open(
		std::string_view path,
		std::uint64_t timeout_ms,
		std::string &error)
{
	if (path.empty() || path.size() > 100)
	{
		error = "MOTRONIC_BRIDGE_SOCKET path must contain 1..100 bytes";
		return false;
	}
	if (!timeout_ms || timeout_ms > 600'000)
	{
		error = "bridge timeout must be 1..600000 ms";
		return false;
	}
	m_path = path;
	m_timeout = std::chrono::milliseconds(timeout_ms);
	std::uint64_t size = 0;
	const std::error_condition result = osd_file::open(
			"domain." + m_path,
			OPEN_FLAG_READ | OPEN_FLAG_WRITE | OPEN_FLAG_CREATE,
			m_file,
			size);
	if (result)
	{
		error = "cannot create bridge socket " + m_path + ": "
				+ result.message();
		m_path.clear();
		return false;
	}
	return true;
}

bool motronic175_bridge_socket::timed_out(
		std::chrono::steady_clock::time_point start) const
{
	return std::chrono::steady_clock::now() - start >= m_timeout;
}

bool motronic175_bridge_socket::read_line(
		std::string &line,
		std::string &error)
{
	const auto start = std::chrono::steady_clock::now();
	while (true)
	{
		const std::size_t newline = m_pending.find('\n');
		if (newline != std::string::npos)
		{
			line = m_pending.substr(0, newline);
			m_pending.erase(0, newline + 1);
			if (!line.empty() && line.back() == '\r')
				line.pop_back();
			return true;
		}
		if (timed_out(start))
		{
			error = "bridge read timeout";
			return false;
		}

		std::array<char, 4096> buffer{};
		std::uint32_t actual = 0;
		const std::error_condition result =
				m_file->read(buffer.data(), 0, buffer.size(), actual);
		if (result == std::errc::operation_would_block)
		{
			std::this_thread::sleep_for(std::chrono::milliseconds(1));
			continue;
		}
		if (result)
		{
			error = "bridge read failed: " + result.message();
			return false;
		}
		if (!actual)
		{
			if (!m_connected)
			{
				m_connected = true;
				continue;
			}
			error = "bridge client disconnected";
			return false;
		}
		m_connected = true;
		m_pending.append(buffer.data(), actual);
		if (m_pending.size() > MAX_LINE_BYTES)
		{
			error = "bridge command exceeds line limit";
			return false;
		}
	}
}

bool motronic175_bridge_socket::write_line(
		std::string_view line,
		std::string &error)
{
	if (!m_connected)
	{
		error = "bridge client is not connected";
		return false;
	}
	if (line.size() > MAX_LINE_BYTES)
	{
		error = "bridge response exceeds line limit";
		return false;
	}
	const std::string framed = std::string(line) + "\n";
	const auto start = std::chrono::steady_clock::now();
	std::size_t offset = 0;
	while (offset < framed.size())
	{
		if (timed_out(start))
		{
			error = "bridge write timeout";
			return false;
		}
		std::uint32_t actual = 0;
		const std::error_condition result = m_file->write(
				framed.data() + offset,
				0,
				framed.size() - offset,
				actual);
		if (result == std::errc::operation_would_block)
		{
			std::this_thread::sleep_for(std::chrono::milliseconds(1));
			continue;
		}
		if (result || !actual)
		{
			error = result ? "bridge write failed: " + result.message()
					: "bridge client disconnected during write";
			return false;
		}
		offset += actual;
	}
	return true;
}
