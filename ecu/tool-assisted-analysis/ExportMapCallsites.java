// Export calls to the internal-ROM map service and immediate R2 indices.

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

public class ExportMapCallsites extends GhidraScript {
    private static final long MASTER_LOOKUP = 0x0400;
    private static final int CONTEXT_INSTRUCTIONS = 8;

    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("output path argument required");
        }
        Address lookup = currentProgram.getAddressFactory()
            .getAddressSpace("CODE").getAddress(MASTER_LOOKUP);
        List<Map<String, Object>> calls = new ArrayList<>();
        ReferenceIterator references =
            currentProgram.getReferenceManager().getReferencesTo(lookup);
        while (references.hasNext()) {
            Reference reference = references.next();
            if (!reference.getReferenceType().isCall()) {
                continue;
            }
            Address callAddress = reference.getFromAddress();
            Function function = currentProgram.getFunctionManager()
                .getFunctionContaining(callAddress);
            Instruction call =
                currentProgram.getListing().getInstructionAt(callAddress);
            if (function == null || call == null) {
                continue;
            }
            List<Instruction> context = contextBefore(function, call);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("call_address", display(callAddress));
            item.put("function", display(function.getEntryPoint()));
            item.put("function_name", function.getName());
            item.put("context", instructionRecords(context));
            item.put("call", instructionRecord(call));
            item.put("r2_index", immediateR2(context));
            calls.add(item);
        }
        calls.sort((left, right) -> ((String) left.get("call_address"))
            .compareTo((String) right.get("call_address")));
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("master_lookup", "CODE:0400");
        report.put("call_count", calls.size());
        report.put("resolved_immediate_r2_count", calls.stream()
            .filter(item -> item.get("r2_index") != null).count());
        report.put("callsites", calls);
        try (FileWriter writer = new FileWriter(args[0])) {
            new GsonBuilder().setPrettyPrinting().create().toJson(report, writer);
            writer.write("\n");
        }
    }

    private List<Instruction> contextBefore(
            Function function, Instruction call) {
        List<Instruction> reversed = new ArrayList<>();
        Instruction cursor = call;
        for (int count = 0; count < CONTEXT_INSTRUCTIONS; count++) {
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
            Scalar scalar = instruction.getScalar(1);
            return scalar == null ? null : (int) scalar.getUnsignedValue();
        }
        return null;
    }

    private List<Map<String, Object>> instructionRecords(
            List<Instruction> instructions) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Instruction instruction : instructions) {
            result.add(instructionRecord(instruction));
        }
        return result;
    }

    private Map<String, Object> instructionRecord(Instruction instruction) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("address", display(instruction.getAddress()));
        result.put("mnemonic", instruction.getMnemonicString());
        result.put("text", instruction.toString());
        try {
            result.put("bytes", bytesHex(instruction.getBytes()));
        }
        catch (MemoryAccessException exception) {
            result.put("bytes", null);
        }
        List<String> operands = new ArrayList<>();
        for (int index = 0; index < instruction.getNumOperands(); index++) {
            operands.add(
                instruction.getDefaultOperandRepresentation(index)
            );
        }
        result.put("operands", operands);
        return result;
    }

    private String display(Address address) {
        return String.format(
            "%s:%04x",
            address.getAddressSpace().getName(),
            address.getOffset()
        );
    }

    private String bytesHex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) {
            result.append(String.format("%02x", value & 0xff));
        }
        return result.toString();
    }
}
