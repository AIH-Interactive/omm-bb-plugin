import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.luaj.vm2.Globals;
import org.luaj.vm2.LoadState;
import org.luaj.vm2.LuaError;
import org.luaj.vm2.LuaTable;
import org.luaj.vm2.LuaValue;
import org.luaj.vm2.Varargs;
import org.luaj.vm2.compiler.LuaC;
import org.luaj.vm2.lib.Bit32Lib;
import org.luaj.vm2.lib.PackageLib;
import org.luaj.vm2.lib.StringLib;
import org.luaj.vm2.lib.TableLib;
import org.luaj.vm2.lib.VarArgFunction;
import org.luaj.vm2.lib.jse.JseBaseLib;
import org.luaj.vm2.lib.jse.JseMathLib;

/**
 * Compiles and runs a Lua file with the LuaJ bundled in the OMM release JAR,
 * using the same library set as the P0 probe. A minimal `events` stub records
 * TICK/RENDER callbacks and runs each `ticks` times so generated and original
 * scripts can be compared by their printed output.
 *
 * Usage: java -cp core.jar;jse.jar LuaRun.java <file.lua> [ticks]
 * Exit code 0 = ok, 1 = compile/runtime error.
 */
public final class LuaRun {
    private LuaRun() {
    }

    public static void main(String[] args) throws Exception {
        String source = Files.readString(Path.of(args[0]), StandardCharsets.UTF_8);
        int ticks = args.length > 1 ? Integer.parseInt(args[1]) : 0;

        Globals globals = new Globals();
        globals.load(new JseBaseLib());
        globals.load(new PackageLib());
        globals.load(new Bit32Lib());
        globals.load(new TableLib());
        globals.load(new StringLib());
        globals.load(new JseMathLib());
        LoadState.install(globals);
        LuaC.install(globals);

        LuaTable events = new LuaTable();
        LuaTable tick = createEvent();
        LuaTable render = createEvent();
        events.set("TICK", tick);
        events.set("RENDER", render);
        globals.set("events", events);

        try {
            globals.load(source, "@" + Path.of(args[0]).getFileName()).call();
            for (int i = 0; i < ticks; i++) {
                fire(tick, LuaValue.NONE);
                fire(render, LuaValue.valueOf(0.5));
            }
        } catch (LuaError error) {
            System.out.println("LUA_ERROR " + error.getMessage());
            System.exit(1);
        }
    }

    private static LuaTable createEvent() {
        LuaTable event = new LuaTable();
        LuaTable callbacks = new LuaTable();
        event.set("__callbacks", callbacks);
        event.set("register", new VarArgFunction() {
            @Override
            public Varargs invoke(Varargs args) {
                callbacks.insert(callbacks.length() + 1, args.checkfunction(2));
                return LuaValue.NONE;
            }
        });
        return event;
    }

    private static void fire(LuaTable event, Varargs args) {
        LuaTable callbacks = (LuaTable) event.get("__callbacks");
        for (int i = 1; i <= callbacks.length(); i++) {
            callbacks.get(i).invoke(args);
        }
    }
}
