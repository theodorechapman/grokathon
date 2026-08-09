// Emit bounded canonical execution state beyond the existing reset-prefix trace.

import java.io.FileWriter;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.GsonBuilder;

import ghidra.app.emulator.EmulatorHelper;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressSpace;

public class TraceBoundedState extends GhidraScript {
    private static final String[] REGISTERS = {
        "ACC", "B", "PSW", "SP", "DPTR", "R0", "R1", "R2", "R3",
        "R4", "R5", "R6", "R7",
    };

    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 1 || args.length > 2) {
            throw new IllegalArgumentException("output path and optional count required");
        }
        int count = args.length == 2 ? Integer.parseInt(args[1]) : 64;
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("engine", "Ghidra Sleigh EmulatorHelper");
        report.put("runtime", true);
        report.put("profile", "canonical-zero-default-peripherals");
        report.put("access_observation", "unavailable");
        report.put("fixture_registers", Map.of("sp", 7, "r0-r7", 0));
        report.put("events", traceResetAndInitialization(count));
        try (FileWriter writer = new FileWriter(args[0])) {
            new GsonBuilder().serializeNulls().setPrettyPrinting()
                .create().toJson(report, writer);
            writer.write("\n");
        }
    }

    private List<Map<String, Object>> traceResetAndInitialization(int count)
            throws Exception {
        EmulatorHelper emulator = new EmulatorHelper(currentProgram);
        List<Map<String, Object>> events = new ArrayList<>();
        try {
            initialize(emulator);
            emulator.writeRegister(emulator.getPCRegister(), 0);
            for (int ordinal = 0; ordinal < count; ordinal++) {
                Address pc = emulator.getExecutionAddress();
                events.add(instruction(emulator, ordinal, pc));
                if (!emulator.step(monitor)) {
                    throw new IllegalStateException(
                        "EmulatorHelper stopped at " + display(pc)
                    );
                }
            }
        }
        finally {
            emulator.dispose();
        }
        return events;
    }

    private Map<String, Object> instruction(
            EmulatorHelper emulator, int ordinal, Address pc) {
        Map<String, Object> event = new LinkedHashMap<>();
        Map<String, Long> registers = new LinkedHashMap<>();
        for (String name : REGISTERS) {
            BigInteger value = emulator.readRegister(name);
            if (value != null) {
                registers.put(normalize(name), value.longValue());
            }
        }
        event.put("kind", "instruction");
        event.put("ordinal", ordinal);
        event.put("pc", display(pc));
        event.put("cycles", null);
        event.put("registers", registers);
        event.put("accesses", new ArrayList<>());
        event.put("interrupt_entry", interruptName(pc, ordinal));
        return event;
    }

    private void initialize(EmulatorHelper emulator) {
        emulator.writeMemory(address("INTMEM", 0), new byte[256]);
        for (String register :
                new String[] {"PSW", "B", "DPH", "DPL", "ACC"}) {
            emulator.writeRegister(register, 0);
        }
        emulator.writeRegister("SP", 7);
        for (int index = 0; index < 8; index++) {
            emulator.writeRegister("R" + index, 0);
        }
        emulator.writeMemory(
            address("SFR", 0xa9), new byte[] {(byte) 0}
        );
    }

    private Address address(String spaceName, long offset) {
        AddressSpace space =
            currentProgram.getAddressFactory().getAddressSpace(spaceName);
        if (space == null) {
            throw new IllegalArgumentException("missing space " + spaceName);
        }
        return space.getAddress(offset);
    }

    private String interruptName(Address pc, int ordinal) {
        if (ordinal == 0 || !pc.getAddressSpace().getName().equals("CODE")) {
            return null;
        }
        return switch ((int) pc.getOffset()) {
            case 0x0003 -> "external-0";
            case 0x000b -> "timer-0";
            case 0x0013 -> "external-1";
            case 0x001b -> "timer-1";
            case 0x0023 -> "uart";
            case 0x002b -> "timer-2";
            case 0x0043 -> "adc";
            case 0x0053 -> "external-3";
            default -> null;
        };
    }

    private String normalize(String name) {
        return name.equals("ACC") ? "a" : name.toLowerCase();
    }

    private String display(Address value) {
        return String.format(
            "%s:%04x", value.getAddressSpace().getName(), value.getOffset()
        );
    }
}
