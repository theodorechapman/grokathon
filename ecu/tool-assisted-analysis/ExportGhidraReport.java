// Export semantic function, reference, and decompiler evidence as JSON.

import java.io.FileWriter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
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
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import ghidra.program.model.symbol.ReferenceManager;

public class ExportGhidraReport extends GhidraScript {
    private static final long CALIBRATION_START = 0x42d0;
    private static final long CALIBRATION_END = 0x5a2e;
    private static final int MAX_DECOMPILED = 80;
    private final List<Function> functions = new ArrayList<>();
    private final List<Map<String, Object>> records = new ArrayList<>();
    private final Map<String, Map<String, Object>> recordsByEntry =
        new LinkedHashMap<>();

    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("output path argument required");
        }
        collectFunctions();
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("program", currentProgram.getName());
        report.put("language", currentProgram.getLanguageID().toString());
        report.put(
            "compiler",
            currentProgram.getCompilerSpec().getCompilerSpecID().toString()
        );
        report.put("memory_blocks", collectBlocks());
        report.put("function_count", records.size());
        report.put("functions", records);
        report.put("decompiled", decompileSelected());
        try (FileWriter writer = new FileWriter(args[0])) {
            new GsonBuilder().setPrettyPrinting().create().toJson(report, writer);
            writer.write("\n");
        }
    }

    private String display(Address address) {
        return String.format(
            "%s:%04x",
            address.getAddressSpace().getName(),
            address.getOffset()
        );
    }

    private void collectFunctions() {
        ReferenceManager references = currentProgram.getReferenceManager();
        FunctionIterator iterator =
            currentProgram.getFunctionManager().getFunctions(true);
        while (iterator.hasNext()) {
            Function function = iterator.next();
            functions.add(function);
            Map<String, Object> record = new LinkedHashMap<>();
            String entry = display(function.getEntryPoint());
            record.put("entry", entry);
            record.put("name", function.getName());
            record.put("body_size", function.getBody().getNumAddresses());
            record.put("instruction_count", instructionCount(function));
            record.put("callers", callersOf(function, references));
            collectReferences(function, references, record);
            records.add(record);
            recordsByEntry.put(entry, record);
        }
    }

    private int instructionCount(Function function) {
        int count = 0;
        InstructionIterator iterator =
            currentProgram.getListing().getInstructions(
                function.getBody(), true
            );
        while (iterator.hasNext()) {
            iterator.next();
            count++;
        }
        return count;
    }

    private void collectReferences(
            Function function,
            ReferenceManager references,
            Map<String, Object> record) {
        Set<String> sfr = new LinkedHashSet<>();
        Set<String> calibration = new LinkedHashSet<>();
        Set<String> flow = new LinkedHashSet<>();
        AddressIterator sources = references.getReferenceSourceIterator(
            function.getBody(), true
        );
        while (sources.hasNext()) {
            Address source = sources.next();
            for (Reference reference : references.getReferencesFrom(source)) {
                Address target = reference.getToAddress();
                String space = target.getAddressSpace().getName();
                long offset = target.getOffset();
                if ("SFR".equals(space)
                        || ("INTMEM".equals(space) && offset >= 0x80)) {
                    sfr.add(display(target));
                }
                else if ("CODE".equals(space)
                        && offset >= CALIBRATION_START
                        && offset < CALIBRATION_END) {
                    calibration.add(display(target));
                }
                else if ("CODE".equals(space)
                        && reference.getReferenceType().isFlow()) {
                    flow.add(display(target));
                }
            }
        }
        record.put("sfr_refs", sorted(sfr));
        record.put("calibration_refs", sorted(calibration));
        record.put("flow_refs", sorted(flow));
    }

    private List<String> callersOf(
            Function function, ReferenceManager references) {
        Set<String> callers = new LinkedHashSet<>();
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
                callers.add(display(caller.getEntryPoint()));
            }
        }
        return sorted(callers);
    }

    private List<String> sorted(Set<String> values) {
        List<String> result = new ArrayList<>(values);
        Collections.sort(result);
        return result;
    }

    private List<Map<String, Object>> collectBlocks() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (MemoryBlock block : currentProgram.getMemory().getBlocks()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", block.getName());
            item.put("start", display(block.getStart()));
            item.put("end", display(block.getEnd()));
            item.put("size", block.getSize());
            item.put("initialized", block.isInitialized());
            item.put("read", block.isRead());
            item.put("write", block.isWrite());
            item.put("execute", block.isExecute());
            result.add(item);
        }
        return result;
    }

    private Map<String, Object> decompileSelected() {
        List<Function> ranked = new ArrayList<>(functions);
        ranked.sort(Comparator.comparingInt(this::interestScore).reversed());
        Map<String, Object> result = new LinkedHashMap<>();
        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        for (Function function :
                ranked.subList(0, Math.min(MAX_DECOMPILED, ranked.size()))) {
            String entry = display(function.getEntryPoint());
            DecompileResults decompiled =
                decompiler.decompileFunction(function, 30, monitor);
            if (decompiled.decompileCompleted()) {
                result.put(
                    entry, decompiled.getDecompiledFunction().getC()
                );
            }
            else {
                result.put(entry, decompiled.getErrorMessage());
            }
        }
        decompiler.dispose();
        return result;
    }

    @SuppressWarnings("unchecked")
    private int interestScore(Function function) {
        Map<String, Object> record =
            recordsByEntry.get(display(function.getEntryPoint()));
        int count = (Integer) record.get("instruction_count");
        int score = count;
        if (!((List<String>) record.get("calibration_refs")).isEmpty()) {
            score += 1_000_000;
        }
        if (!((List<String>) record.get("sfr_refs")).isEmpty()) {
            score += 100_000;
        }
        return score;
    }
}
