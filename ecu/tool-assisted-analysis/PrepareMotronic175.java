// Repair the split SAB80C515 code map before Ghidra analysis.

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressSpace;
import ghidra.program.model.listing.Function;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.symbol.SourceType;

public class PrepareMotronic175 extends GhidraScript {
    private static final long INTERNAL_ROM_SIZE = 0x2000;
    private static final Object[][] EXTERNAL_ENTRIES = {
        {0x2000L, "external_entry_dispatch"},
        {0x206eL, "external_entry_206e"},
        {0x20e8L, "external_entry_main"},
        {0x8000L, "external_entry_8000"},
    };
    private static final Object[][] INTERNAL_LABELS = {
        {0x0000L, "internal_reset_vector"},
        {0x0003L, "internal_ext0_vector"},
        {0x000bL, "internal_timer0_vector"},
        {0x0013L, "internal_ext1_vector"},
        {0x001bL, "internal_timer1_vector"},
        {0x0023L, "internal_serial_vector"},
        {0x002bL, "internal_timer2_vector"},
        {0x0400L, "internal_master_map_lookup"},
    };
    private static final Object[][] SFRS = {
        {0x80L, "P0"}, {0x81L, "SP"}, {0x82L, "DPL"},
        {0x83L, "DPH"}, {0x86L, "WDTREL"}, {0x87L, "PCON"},
        {0x88L, "TCON"}, {0x89L, "TMOD"}, {0x8aL, "TL0"},
        {0x8bL, "TL1"}, {0x8cL, "TH0"}, {0x8dL, "TH1"},
        {0x90L, "P1"}, {0x98L, "SCON"}, {0x99L, "SBUF"},
        {0xa0L, "P2"}, {0xa8L, "IEN0"}, {0xa9L, "IP0"},
        {0xb0L, "P3"}, {0xb8L, "IEN1"}, {0xb9L, "IP1"},
        {0xc0L, "IRCON"}, {0xc1L, "CCEN"}, {0xc2L, "CCL1"},
        {0xc3L, "CCH1"}, {0xc4L, "CCL2"}, {0xc5L, "CCH2"},
        {0xc6L, "CCL3"}, {0xc7L, "CCH3"}, {0xc8L, "T2CON"},
        {0xcaL, "CRCL"}, {0xcbL, "CRCH"}, {0xccL, "TL2"},
        {0xcdL, "TH2"}, {0xd0L, "PSW"}, {0xd8L, "ADCON0"},
        {0xd9L, "ADDAT"}, {0xdaL, "DAPR"}, {0xe0L, "ACC"},
        {0xe8L, "P4"}, {0xf0L, "B"}, {0xf8L, "P5"},
    };

    @Override
    protected void run() throws Exception {
        remapPhysicalRom();
        seedSymbols();
        seedExternalFunctions();
        analyzeAll(currentProgram);
    }

    private Address inSpace(String name, long offset) {
        AddressSpace space =
            currentProgram.getAddressFactory().getAddressSpace(name);
        return space == null ? null : space.getAddress(offset);
    }

    private void remapPhysicalRom() throws Exception {
        Memory memory = currentProgram.getMemory();
        Address zero = inSpace("CODE", 0);
        Address splitAt = inSpace("CODE", INTERNAL_ROM_SIZE);
        Address high = inSpace("CODE", 0x8000);
        MemoryBlock block = memory.getBlock(zero);
        if (block != null && block.getStart().equals(zero)) {
            if (block.getEnd().getOffset() >= INTERNAL_ROM_SIZE) {
                memory.split(block, splitAt);
            }
            MemoryBlock low = memory.getBlock(zero);
            memory.moveBlock(low, high, monitor);
            setPermissions(low, "EXTERNAL_EPROM_HIGH_ALIAS");
        }
        if (memory.getBlock(zero) == null) {
            MemoryBlock internal = memory.createUninitializedBlock(
                "INTERNAL_MASK_ROM_UNDUMPED",
                zero,
                INTERNAL_ROM_SIZE,
                false
            );
            setPermissions(internal, "INTERNAL_MASK_ROM_UNDUMPED");
        }
        MemoryBlock external = memory.getBlock(splitAt);
        if (external != null) {
            setPermissions(external, "EXTERNAL_EPROM_LOW");
        }
    }

    private void setPermissions(MemoryBlock block, String name)
            throws Exception {
        block.setName(name);
        block.setRead(true);
        block.setWrite(false);
        block.setExecute(true);
    }

    private void seedSymbols() {
        for (Object[] item : INTERNAL_LABELS) {
            safeLabel(inSpace("CODE", (Long) item[0]), (String) item[1]);
        }
        for (Object[] item : SFRS) {
            safeLabel(inSpace("SFR", (Long) item[0]), (String) item[1]);
        }
    }

    private void safeLabel(Address address, String name) {
        if (address == null) {
            return;
        }
        try {
            createLabel(address, name, true, SourceType.USER_DEFINED);
        }
        catch (Exception ignored) {
            println("Label skipped: " + name);
        }
    }

    private void seedExternalFunctions() {
        Memory memory = currentProgram.getMemory();
        for (Object[] item : EXTERNAL_ENTRIES) {
            Address entry = inSpace("CODE", (Long) item[0]);
            String name = (String) item[1];
            if (entry == null || !memory.contains(entry)) {
                continue;
            }
            try {
                disassemble(entry);
                Function function = getFunctionAt(entry);
                if (function == null) {
                    createFunction(entry, name);
                }
                else {
                    function.setName(name, SourceType.USER_DEFINED);
                }
            }
            catch (Exception exception) {
                println("Function seed failed at " + entry);
            }
        }
    }
}
