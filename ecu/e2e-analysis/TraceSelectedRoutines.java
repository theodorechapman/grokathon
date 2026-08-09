// Execute reset entry and calibration lookup with deterministic state.

import java.io.FileWriter;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.GsonBuilder;

import ghidra.app.emulator.EmulatorHelper;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressSpace;

public class TraceSelectedRoutines extends GhidraScript {
    private static final int[] INPUT_VALUES = {0, 64, 128, 255};
    private static final int[] INPUT_LOCATIONS = {
        0x04, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x40,
    };

    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("output path required");
        }
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("engine", "Ghidra Sleigh EmulatorHelper");
        report.put("qualification", (
            "Software-only execution with zero/default peripheral state; " +
            "not vehicle or electrical validation."
        ));
        report.put("reset_trace", traceReset());
        report.put("lookup_traces", traceLookups());
        try (FileWriter writer = new FileWriter(args[0])) {
            new GsonBuilder().serializeNulls().setPrettyPrinting()
                .create().toJson(report, writer);
            writer.write("\n");
        }
    }

    private Address address(String spaceName, long offset) {
        AddressSpace space =
            currentProgram.getAddressFactory().getAddressSpace(spaceName);
        if (space == null) {
            throw new IllegalArgumentException("missing space " + spaceName);
        }
        return space.getAddress(offset);
    }

    private List<Map<String, Object>> traceReset() throws Exception {
        EmulatorHelper emulator = new EmulatorHelper(currentProgram);
        List<Map<String, Object>> trace = new ArrayList<>();
        try {
            initialize(emulator);
            emulator.writeRegister(emulator.getPCRegister(), 0);
            for (int step = 0; step < 32; step++) {
                Address pc = emulator.getExecutionAddress();
                trace.add(stepRecord(step, pc));
                if (pc.getAddressSpace().getName().equals("CODE")
                        && pc.getOffset() == 0x5c00) {
                    break;
                }
                if (!emulator.step(monitor)) {
                    break;
                }
            }
        }
        finally {
            emulator.dispose();
        }
        return trace;
    }

    private List<Map<String, Object>> traceLookups() throws Exception {
        List<Map<String, Object>> traces = new ArrayList<>();
        for (int input : INPUT_VALUES) {
            for (int index = 0; index <= 24; index++) {
                traces.add(traceLookup(index, input));
            }
        }
        return traces;
    }

    private Map<String, Object> traceLookup(
            int index, int input) throws Exception {
        EmulatorHelper emulator = new EmulatorHelper(currentProgram);
        Map<String, Object> result = new LinkedHashMap<>();
        List<String> pcs = new ArrayList<>();
        result.put("selector_base", "CODE:4000");
        result.put("pointer_base", "CODE:45c0");
        result.put("logical_index", index);
        result.put("synthetic_input", input);
        try {
            initialize(emulator);
            writeByte(emulator, "INTMEM", 0x73, 0x45);
            writeByte(emulator, "INTMEM", 0x74, 0xc0);
            writeByte(emulator, "INTMEM", 0x75, 0x40);
            writeByte(emulator, "INTMEM", 0x76, 0x00);
            for (int location : INPUT_LOCATIONS) {
                writeByte(emulator, "INTMEM", location, input);
            }
            emulator.writeRegister("SP", 0x30);
            emulator.writeRegister("R2", index);
            emulator.writeRegister(emulator.getPCRegister(), 0x0400);
            boolean completed = false;
            for (int step = 0; step < 2000; step++) {
                Address pc = emulator.getExecutionAddress();
                pcs.add(display(pc));
                if (pc.getOffset() == 0x0469) {
                    completed = true;
                    break;
                }
                if (!emulator.step(monitor)) {
                    break;
                }
            }
            result.put("completed_at_ret", completed);
            result.put("steps", pcs.size());
            result.put("result_acc", register(emulator, "ACC"));
            result.put("emulator_r2_register", register(emulator, "R2"));
            result.put("r2_observation_caveat",
                "Ghidra exposes banked R2 as one register; use CODE:040f " +
                "as authoritative proof that the caller-bank R2 increments.");
            result.put("terminator_bit", bit(emulator, 0x4b));
            result.put("pc_prefix", pcs.subList(0, Math.min(24, pcs.size())));
            result.put("visited_addresses",
                new ArrayList<String>(new LinkedHashSet<String>(pcs)));
        }
        catch (Exception exception) {
            result.put("error", exception.toString());
        }
        finally {
            emulator.dispose();
        }
        return result;
    }

    private void writeByte(
            EmulatorHelper emulator, String space, long offset, int value) {
        emulator.writeMemory(
            address(space, offset), new byte[] {(byte) value}
        );
    }

    private void initialize(EmulatorHelper emulator) {
        emulator.writeMemory(address("INTMEM", 0), new byte[256]);
        for (String register :
                new String[] {"PSW", "B", "DPH", "DPL", "ACC"}) {
            emulator.writeRegister(register, 0);
        }
        writeByte(emulator, "SFR", 0xa9, 0);
    }

    private long bit(EmulatorHelper emulator, long offset) {
        byte[] value = emulator.readMemory(address("BITS", offset), 1);
        return value == null ? -1 : value[0] & 1;
    }

    private long register(EmulatorHelper emulator, String name) {
        BigInteger value = emulator.readRegister(name);
        return value == null ? -1 : value.longValue();
    }

    private Map<String, Object> stepRecord(int step, Address pc) {
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("step", step);
        record.put("pc", display(pc));
        return record;
    }

    private String display(Address value) {
        return String.format("%s:%04x",
            value.getAddressSpace().getName(), value.getOffset());
    }
}
