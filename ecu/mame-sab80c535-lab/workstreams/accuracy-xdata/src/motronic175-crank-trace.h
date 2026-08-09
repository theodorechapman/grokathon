// license:BSD-3-Clause
// copyright-holders:Supratik Lahiri

#ifndef MAME_SKELETON_MOTRONIC175_CRANK_TRACE_H
#define MAME_SKELETON_MOTRONIC175_CRANK_TRACE_H

#pragma once

#include "emu.h"

#include <fstream>
#include <sstream>
#include <string>
#include <vector>

struct motronic_crank_transition
{
	u64 cycle;
	bool high;
};

inline std::vector<motronic_crank_transition> load_motronic_crank_trace(
		const char *path)
{
	std::ifstream input(path);
	if (!input)
		fatalerror("cannot open MOTRONIC_CRANK_TRACE=%s\n", path);

	std::vector<motronic_crank_transition> result;
	std::string line;
	unsigned line_number = 0;
	while (std::getline(input, line))
	{
		++line_number;
		if (line.empty() || line[0] == '#')
			continue;
		std::istringstream row(line);
		u64 cycle;
		unsigned level;
		char comma;
		char trailing;
		if (!(row >> cycle >> comma >> level) || comma != ',' || level > 1
				|| (row >> trailing))
		{
			fatalerror(
					"invalid crank trace line %u: %s\n",
					line_number,
					line.c_str());
		}
		if (!result.empty() && cycle <= result.back().cycle)
			fatalerror("crank trace cycles must increase at line %u\n", line_number);
		result.push_back({cycle, level != 0});
	}
	if (result.empty())
		fatalerror("crank trace contains no transitions: %s\n", path);
	return result;
}

#endif
