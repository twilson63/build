import build/effect
import build/runtime/agent
import build/runtime/preview
import build/runtime/project
import build/runtime/settings
import build/runtime/webcontainer
import build/runtime/zip

pub fn interpret(effect: effect.Effect) -> Nil {
  case effect {
    effect.Settings(payload) -> settings.interpret(payload)
    effect.Project(payload) -> project.interpret(payload)
    effect.Agent(payload) -> agent.interpret(payload)
    effect.Preview(payload) -> preview.interpret(payload)
    effect.WebContainer(payload) -> webcontainer.interpret(payload)
    effect.ExportZip(files) -> zip.export_zip(files)
  }
}

pub fn interpret_all(effects: List(effect.Effect)) -> Nil {
  case effects {
    [] -> Nil
    [first, ..rest] -> {
      interpret(first)
      interpret_all(rest)
    }
  }
}
