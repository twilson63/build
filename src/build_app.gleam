import build/model
import build/msg
import build/runtime
import build/update
import build/view
import gleam/io
import lustre
import lustre/effect as lustre_effect

pub fn main() -> Nil {
  let app =
    lustre.application(
      init: fn(_) { #(model.init(), lustre_effect.none()) },
      update: fn(app, message) {
        let #(next, effects) = update.update(app, message)
        runtime.interpret_all(effects)
        #(next, lustre_effect.none())
      },
      view: view.view,
    )

  case lustre.start(app, "#root", Nil) {
    Ok(runtime) -> {
      register_runtime(runtime)
      lustre.send(runtime, lustre.dispatch(msg.InitApp))
    }
    Error(_) -> io.println("Unable to start the Gleam/Lustre prototype app")
  }
}

pub fn prototype_title() -> String {
  "Build"
}

@external(javascript, "./gleam-externals/runtime_bridge.mjs", "registerRuntime")
fn register_runtime(runtime: lustre.Runtime(msg.Msg)) -> Nil
