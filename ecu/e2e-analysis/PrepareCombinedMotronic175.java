// Prepare the CPU-addressed SAB80C515 combined ROM for analysis.

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressSpace;
import ghidra.program.model.listing.Function;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.symbol.SourceType;

public class PrepareCombinedMotronic175 extends GhidraScript {
    private static final Object[][] CODE_SYMBOLS = {
        {0x0000L, "reset_vector"},
        {0x0003L, "ext0_vector"},
        {0x000bL, "timer0_vector"},
        {0x0013L, "ext1_vector"},
        {0x001bL, "timer1_vector"},
        {0x0023L, "serial_vector"},
        {0x002bL, "timer2_vector"},
        {0x0043L, "adc_vector"},
        {0x004bL, "ext2_vector"},
        {0x0053L, "ext3_vector"},
        {0x005bL, "ext4_vector"},
        {0x0063L, "ext5_vector"},
        {0x006bL, "ext6_vector"},
        {0x0073L, "latch_watchdog_reset_cause"},
        {0x0100L, "eprom_program_and_verify"},
        {0x0400L, "calibration_lookup"},
        {0x054eL, "internal_math_054e"},
        {0x0562L, "internal_math_0562"},
        {0x0589L, "internal_math_0589"},
        {0x05a7L, "internal_math_05a7"},
        {0x05c8L, "internal_math_05c8"},
        {0x05cbL, "internal_math_05cb"},
        {0x05fcL, "internal_math_05fc"},
        {0x0625L, "internal_math_0625"},
        {0x0643L, "internal_math_0643"},
        {0x067cL, "internal_math_067c"},
        {0x067fL, "internal_math_067f"},
        {0x0686L, "internal_math_0686"},
        {0x0689L, "internal_math_0689"},
        {0x0690L, "internal_math_0690"},
        {0x2000L, "isr_ext0_wrapper"},
        {0x2010L, "isr_timer0_wrapper"},
        {0x2030L, "isr_ext1_wrapper"},
        {0x2050L, "isr_timer1_wrapper"},
        {0x2060L, "isr_serial_wrapper"},
        {0x2070L, "isr_timer2_wrapper"},
        {0x2080L, "isr_adc_wrapper"},
        {0x2090L, "isr_ext2_wrapper"},
        {0x20a0L, "isr_ext3_wrapper"},
        {0x20b0L, "isr_ext4_wrapper"},
        {0x20c0L, "isr_ext5_wrapper"},
        {0x20d0L, "isr_ext6_wrapper"},
        {0x20e0L, "external_startup"},
        {0x21d8L, "capcom_edge_and_injection_scheduler"},
        {0x2462L, "acquire_crank_sync_from_capture_intervals"},
        {0x2564L, "reset_crank_sync_state"},
        {0x257dL, "timer1_iac_pwm_and_watchdog_isr"},
        {0x25f8L, "enter_synchronized_crank_mode"},
        {0x2606L, "deferred_event_processing_isr"},
        {0x261cL, "synchronized_crank_event_dispatch"},
        {0x27ccL, "crank_period_output_and_cut_scheduler"},
        {0x2ce8L, "acquire_afm_sample_and_delta"},
        {0x2d73L, "afm_to_filtered_airmass"},
        {0x2fd3L, "compute_and_publish_injector_pulsewidth"},
        {0x3585L, "update_ignition_and_transient_corrections"},
        {0x3610L, "lookup_base_ignition_advance"},
        {0x36faL, "encode_saturated_ignition_correction"},
        {0x3711L, "lookup_ignition_dwell_reference"},
        {0x3723L, "update_decel_overrun_latch"},
        {0x3800L, "assemble_fuel_corrections"},
        {0x3a83L, "evaluate_wot_fuel_variant"},
        {0x3fa0L, "scale_filter_supply_voltage"},
        {0x5c00L, "early_hardware_init_and_restart"},
        {0x5d10L, "clear_iram_and_prepare_timer1"},
        {0x601aL, "foreground_cyclic_executive"},
        {0x6099L, "publish_engine_speed_and_load"},
        {0x61b3L, "commit_discrete_output_shadow"},
        {0x6327L, "schedule_supplemental_compare_pulse"},
        {0x678eL, "adaptive_trim_supervisor"},
        {0x6bb7L, "idle_target_and_iac_pwm_controller"},
        {0x6db6L, "publish_iac_pwm_reload_pairs"},
        {0x8000L, "compare_capture_service"},
        {0x8475L, "kw71_protocol_engine"},
        {0x89c4L, "clear_fault_memory"},
        {0x8960L, "serial_interrupt_worker"},
        {0x8bacL, "diagnostic_command_dispatch"},
        {0x8e50L, "update_fault_record"},
        {0x8f97L, "cold_xram_initialize"},
        {0x9016L, "verify_combined_rom_checksum"},
        {0x90f5L, "test_internal_ram_patterns"},
        {0x955cL, "age_fault_records"},
        {0x9e88L, "scan_and_scale_analog_sensors"},
        {0x9ec2L, "adc_read_channel_blocking"},
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
        {0xd9L, "ADDAT"}, {0xdaL, "DAPR"}, {0xdbL, "P6"},
        {0xe0L, "ACC"}, {0xe8L, "P4"}, {0xf0L, "B"}, {0xf8L, "P5"},
    };
    private static final Object[][] BIT_SYMBOLS = {
        {0x10L, "discrete_output_shadow_bit_0"},
        {0x11L, "discrete_output_shadow_bit_1"},
        {0x12L, "discrete_output_shadow_bit_2"},
        {0x13L, "discrete_output_shadow_bit_3"},
        {0x14L, "discrete_output_shadow_bit_4"},
        {0x15L, "discrete_output_shadow_bit_5"},
        {0x21L, "crank_sync_running_mode"},
        {0x2bL, "new_crank_period_available"},
        {0x8cL, "TCON_TR0"}, {0xbeL, "IEN1_SWDT"},
        {0x95L, "logical_ignition_coil_drive_p1_5"},
        {0x97L, "logical_iac_valve_drive_p1_7"},
        {0xc6L, "IRCON_TF2"}, {0xd5L, "PSW_F0"},
        {0xe6L, "ACC_bit6"},
    };
    private static final Object[][] DATA_SYMBOLS = {
        {"INTMEM", 0x22L, "discrete_output_shadow"},
        {"INTMEM", 0x3bL, "engine_speed_index"},
        {"INTMEM", 0x3dL, "crank_period_hi"}, {"INTMEM", 0x3eL, "crank_period_lo"},
        {"INTMEM", 0x50L, "scheduled_ignition_angle"},
        {"INTMEM", 0x51L, "commanded_ignition_angle"},
        {"INTMEM", 0x55L, "coil_dwell_reference"},
        {"INTMEM", 0x56L, "requested_ignition_angle"},
        {"INTMEM", 0x5bL, "injector_pulsewidth_hi"},
        {"INTMEM", 0x5cL, "injector_pulsewidth_lo"},
        {"INTMEM", 0x64L, "iac_pwm_phase_a_hi"}, {"INTMEM", 0x65L, "iac_pwm_phase_a_lo"},
        {"INTMEM", 0x66L, "iac_pwm_phase_b_hi"}, {"INTMEM", 0x67L, "iac_pwm_phase_b_lo"},
        {"EXTMEM", 0xa040L, "io_asic_discrete_output_latch"},
        {"EXTMEM", 0xa041L, "phase_output_sequence_latch"},
    };

    @Override
    protected void run() throws Exception {
        splitMemoryMap();
        applySymbols();
        seedFunctions();
        analyzeAll(currentProgram);
        applySymbols();
        seedFunctions();
    }

    private Address address(String spaceName, long offset) {
        AddressSpace space =
            currentProgram.getAddressFactory().getAddressSpace(spaceName);
        return space == null ? null : space.getAddress(offset);
    }

    private void splitMemoryMap() throws Exception {
        Memory memory = currentProgram.getMemory();
        MemoryBlock whole = memory.getBlock(address("CODE", 0));
        if (whole == null) {
            throw new IllegalStateException("combined ROM block missing");
        }
        if (memory.getBlock(address("CODE", 0x2000)) == whole) {
            memory.split(whole, address("CODE", 0x2000));
        }
        MemoryBlock external = memory.getBlock(address("CODE", 0x2000));
        if (memory.getBlock(address("CODE", 0x8000)) == external) {
            memory.split(external, address("CODE", 0x8000));
        }
        configure(memory.getBlock(address("CODE", 0)), "INTERNAL_MASK_ROM");
        configure(
            memory.getBlock(address("CODE", 0x2000)), "EXTERNAL_EPROM_LOW"
        );
        configure(
            memory.getBlock(address("CODE", 0x8000)), "EXTERNAL_EPROM_HIGH"
        );
    }

    private void configure(MemoryBlock block, String name) throws Exception {
        block.setName(name);
        block.setRead(true);
        block.setWrite(false);
        block.setExecute(true);
    }

    private void applySymbols() {
        for (Object[] item : CODE_SYMBOLS) {
            setLabel(address("CODE", (Long) item[0]), (String) item[1]);
        }
        for (Object[] item : SFRS) {
            setLabel(address("SFR", (Long) item[0]), (String) item[1]);
        }
        for (Object[] item : BIT_SYMBOLS) {
            setLabel(address("BITS", (Long) item[0]), (String) item[1]);
        }
        for (Object[] item : DATA_SYMBOLS) {
            setLabel(address((String) item[0], (Long) item[1]), (String) item[2]);
        }
    }

    private void setLabel(Address location, String name) {
        if (location == null) {
            return;
        }
        try {
            createLabel(location, name, true, SourceType.USER_DEFINED);
        }
        catch (Exception exception) {
            println("Could not label " + location + " as " + name);
        }
    }

    private void seedFunctions() throws Exception {
        Memory memory = currentProgram.getMemory();
        for (Object[] item : CODE_SYMBOLS) {
            Address entry = address("CODE", (Long) item[0]);
            String name = (String) item[1];
            if (entry == null || !memory.contains(entry)
                    || memory.getByte(entry) == (byte) 0xff) {
                continue;
            }
            try {
                disassemble(entry);
                Function function = getFunctionAt(entry);
                if (function == null) {
                    function = createFunction(entry, name);
                }
                if (function != null) {
                    function.setName(name, SourceType.USER_DEFINED);
                }
            }
            catch (Exception exception) {
                println("Could not seed function " + name + " at " + entry);
            }
        }
    }
}
