// Export all callers of the internal calibration lookup service.

import java.io.FileWriter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.GsonBuilder;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.lang.Register;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.mem.MemoryAccessException;
import ghidra.program.model.scalar.Scalar;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;

public class ExportLookupCallsites extends GhidraScript {
    private static final long LOOKUP = 0x0400;
    private static final int CONTEXT_SIZE = 16;

    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("output path required");
        }
        Address lookup = currentProgram.getAddressFactory()
            .getAddressSpace("CODE").getAddress(LOOKUP);
        List<Map<String, Object>> calls = new ArrayList<>();
        ReferenceIterator references =
            currentProgram.getReferenceManager().getReferencesTo(lookup);
        while (references.hasNext()) {
            Reference reference = references.next();
            if (!reference.getReferenceType().isCall()) {
                continue;
            }
            Map<String, Object> record = callsite(reference);
            if (record != null) {
                calls.add(record);
            }
        }
        calls.sort((left, right) -> ((String) left.get("call_address"))
            .compareTo((String) right.get("call_address")));
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("lookup", "CODE:0400");
        report.put("call_count", calls.size());
        report.put("resolved_immediate_r2_count", calls.stream()
            .filter(call -> call.get("r2_index") != null).count());
        report.put("callsites", calls);
        try (FileWriter writer = new FileWriter(args[0])) {
            new GsonBuilder().serializeNulls().setPrettyPrinting()
                .create().toJson(report, writer);
            writer.write("\n");
        }
    }

    private Map<String, Object> callsite(Reference reference) {
        Address callAddress = reference.getFromAddress();
        Function function = currentProgram.getFunctionManager()
            .getFunctionContaining(callAddress);
        Instruction call =
            currentProgram.getListing().getInstructionAt(callAddress);
        if (function == null || call == null) {
            return null;
        }
        List<Instruction> context = contextBefore(function, call);
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("call_address", display(callAddress));
        record.put("function", display(function.getEntryPoint()));
        record.put("function_name", function.getName());
        record.put("r2_index", immediateR2(context));
        record.put("context", instructionRecords(context));
        record.put("call", instructionRecord(call));
        return record;
    }

    private List<Instruction> contextBefore(
            Function function, Instruction call) {
        List<Instruction> reversed = new ArrayList<>();
        Instruction cursor = call;
        for (int count = 0; count < CONTEXT_SIZE; count++) {
            cursor = currentProgram.getListing().getInstructionBefore(
                cursor.getAddress()
            );
            if (cursor == null
                    || !function.getBody().contains(cursor.getAddress())) {
                break;
            }
            reversed.add(cursor);
        }
        Collections.reverse(reversed);
        return reversed;
    }

    private Integer immediateR2(List<Instruction> context) {
        for (int index = context.size() - 1; index >= 0; index--) {
            Instruction instruction = context.get(index);
            if (!"MOV".equals(instruction.getMnemonicString())
                    || instruction.getNumOperands() < 2) {
                continue;
            }
            Register register = instruction.getRegister(0);
            if (register == null || !"R2".equals(register.getName())) {
                continue;
            }
            Scalar value = instruction.getScalar(1);
            return value == null ? null : (int) value.getUnsignedValue();
        }
        return null;
    }

    private List<Map<String, Object>> instructionRecords(
            List<Instruction> instructions) {
        List<Map<String, Object>> records = new ArrayList<>();
        for (Instruction instruction : instructions) {
            records.add(instructionRecord(instruction));
        }
        return records;
    }

    private Map<String, Object> instructionRecord(Instruction instruction) {
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("address", display(instruction.getAddress()));
        record.put("mnemonic", instruction.getMnemonicString());
        record.put("text", instruction.toString());
        record.put("operands", operands(instruction));
        try {
            record.put("bytes", bytesHex(instruction.getBytes()));
        }
        catch (MemoryAccessException exception) {
            record.put("bytes", null);
        }
        return record;
    }

    private List<String> operands(Instruction instruction) {
        List<String> result = new ArrayList<>();
        for (int index = 0; index < instruction.getNumOperands(); index++) {
            result.add(instruction.getDefaultOperandRepresentation(index));
        }
        return result;
    }

    private String display(Address address) {
        return String.format("%s:%04x",
            address.getAddressSpace().getName(), address.getOffset());
    }

    private String bytesHex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) {
            result.append(String.format("%02x", value & 0xff));
        }
        return result.toString();
    }
}
