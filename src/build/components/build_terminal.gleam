import build/actors/webcontainer
import build/msg
import gleam/string
import lustre/attribute
import lustre/element.{type Element, element}
import lustre/element/html
import lustre/event

pub fn view(logs: List(String), enabled: Bool) -> Element(msg.Msg) {
  html.div(
    [attribute.class("terminalPane")],
    [
      html.div(
        [attribute.class("terminalToolbar")],
        [
          html.span([], [html.text("Terminal")]),
          html.button(
            [attribute.type_("button"), attribute.class("ghost compact"), event.on_click(msg.WebContainer(webcontainer.SyncFilesRequested))],
            [html.text("Sync files")],
          ),
        ],
      ),
      html.div(
        [attribute.class("terminal")],
        [element("build-terminal", [attribute.attribute("logs", string.join(logs, "\n")), attribute.attribute("enabled", bool_to_string(enabled))], [])],
      ),
    ],
  )
}

fn bool_to_string(value: Bool) -> String {
  case value {
    True -> "true"
    False -> "false"
  }
}
