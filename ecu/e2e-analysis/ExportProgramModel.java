// Export a lossless reachable-function model and all direct references.

import java.io.FileWriter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.google.gson.GsonBuilder;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressIterator;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.mem.MemoryAccessException;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import ghidra.program.model.symbol.ReferenceManager;
import ghidra.program.model.symbol.RefType;

public class ExportProgramModel extends GhidraScript {
    private ReferenceManager references;
    private DecompInterface decompiler;

    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("output path required");
        }
        references = currentProgram.getReferenceManager();
        decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        List<Map<String, Object>> functions = collectFunctions();
        decompiler.dispose();
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("program", currentProgram.getName());
        report.put("language", currentProgram.getLanguageID().toString());
        report.put("memory_blocks", collectBlocks());
        report.put("function_count", functions.size());
        report.put("functions", functions);
        try (FileWriter writer = new FileWriter(args[0])) {
            new GsonBuilder().serializeNulls().setPrettyPrinting()
                .create().toJson(report, writer);
            writer.write("\n");
        }
    }

    private List<Map<String, Object>> collectFunctions() {
        List<Map<String, Object>> result = new ArrayList<>();
        FunctionIterator iterator =
            currentProgram.getFunctionManager().getFunctions(true);
        while (iterator.hasNext() && !monitor.isCancelled()) {
            result.add(functionRecord(iterator.next()));
        }
        return result;
    }

    private Map<String, Object> functionRecord(Function function) {
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("entry", display(function.getEntryPoint()));
        record.put("name", function.getName());
        record.put("body_size", function.getBody().getNumAddresses());
        record.put("parameter_count", function.getParameterCount());
        record.put("instructions", instructions(function));
        record.put("references", functionReferences(function));
        record.put("callers", callers(function));
        record.put("decompiled", decompile(function));
        return record;
    }

    private List<Map<String, Object>> instructions(Function function) {
        List<Map<String, Object>> result = new ArrayList<>();
        InstructionIterator iterator =
            currentProgram.getListing().getInstructions(
                function.getBody(), true
            );
        while (iterator.hasNext()) {
            Instruction instruction = iterator.next();
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
            result.add(record);
        }
        return result;
    }

    private List<String> operands(Instruction instruction) {
        List<String> result = new ArrayList<>();
        for (int index = 0; index < instruction.getNumOperands(); index++) {
            result.add(
                instruction.getDefaultOperandRepresentation(index)
            );
        }
        return result;
    }

    private List<Map<String, Object>> functionReferences(Function function) {
        List<Map<String, Object>> result = new ArrayList<>();
        AddressIterator sources = references.getReferenceSourceIterator(
            function.getBody(), true
        );
        while (sources.hasNext()) {
            Address source = sources.next();
            for (Reference reference : references.getReferencesFrom(source)) {
                result.add(referenceRecord(reference));
            }
        }
        return result;
    }

    private Map<String, Object> referenceRecord(Reference reference) {
        Map<String, Object> result = new LinkedHashMap<>();
        RefType type = reference.getReferenceType();
        Address target = reference.getToAddress();
        result.put("from", display(reference.getFromAddress()));
        result.put("to", display(target));
        result.put("space", target.getAddressSpace().getName());
        result.put("type", type.getName());
        result.put("read", type.isRead());
        result.put("write", type.isWrite());
        result.put("data", type.isData());
        result.put("flow", type.isFlow());
        result.put("call", type.isCall());
        return result;
    }

    private List<String> callers(Function function) {
        Set<String> result = new LinkedHashSet<>();
        ReferenceIterator iterator =
            references.getReferencesTo(function.getEntryPoint());
        while (iterator.hasNext()) {
            Reference reference = iterator.next();
            if (!reference.getReferenceType().isCall()) {
                continue;
            }
            Function caller = currentProgram.getFunctionManager()
                .getFunctionContaining(reference.getFromAddress());
            if (caller != null) {
                result.add(display(caller.getEntryPoint()));
            }
        }
        return new ArrayList<>(result);
    }

    private Object decompile(Function function) {
        DecompileResults result =
            decompiler.decompileFunction(function, 20, monitor);
        if (result.decompileCompleted()) {
            return result.getDecompiledFunction().getC();
        }
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("error", result.getErrorMessage());
        return error;
    }

    private List<Map<String, Object>> collectBlocks() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (MemoryBlock block : currentProgram.getMemory().getBlocks()) {
            Map<String, Object> record = new LinkedHashMap<>();
            record.put("name", block.getName());
            record.put("start", display(block.getStart()));
            record.put("end", display(block.getEnd()));
            record.put("size", block.getSize());
            record.put("initialized", block.isInitialized());
            record.put("read", block.isRead());
            record.put("write", block.isWrite());
            record.put("execute", block.isExecute());
            result.add(record);
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
