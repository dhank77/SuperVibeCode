process.env.OPENCODE_DB = ":memory:"
process.env.NPM_CONFIG_AUDIT = "false"
// Tests assert exact skill lists; the bundled design skills have their own test.
process.env.SUPERVIBECODE_BUILTIN_SKILLS = "0"
