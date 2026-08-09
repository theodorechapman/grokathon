#include "motronic175-adc.h"

#include <charconv>
#include <cstdint>
#include <iostream>
#include <string>

namespace {

bool parse_time(const char *text, std::uint64_t &time_us)
{
	const char *end = text + std::char_traits<char>::length(text);
	const auto result = std::from_chars(text, end, time_us);
	return result.ec == std::errc{} && result.ptr == end;
}

} // anonymous namespace

int main(int argc, char **argv)
{
	if (argc < 3 || argc > 4)
	{
		std::cerr << "usage: provider-probe PROFILE TIME_US [FAULT_CHANNEL]\n";
		return 2;
	}

	std::uint64_t time_us = 0;
	if (!parse_time(argv[2], time_us))
	{
		std::cerr << "TIME_US must be an unsigned integer\n";
		return 2;
	}

	motronic175_adc_provider provider;
	std::string error;
	if (!provider.configure(argv[1], argc == 4 ? argv[3] : nullptr, error))
	{
		std::cerr << error << '\n';
		return 2;
	}

	for (std::uint8_t channel = 0; channel < 8; ++channel)
	{
		if (channel)
			std::cout << ',';
		std::cout << unsigned(provider.sample(channel, time_us));
	}
	std::cout << '\n';
	return 0;
}
