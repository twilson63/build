import build/actors/project
import build/msg
import gleam/dynamic/decode
import lustre/attribute
import lustre/element.{type Element, element}
import lustre/event

pub fn view(path: String, content: String) -> Element(msg.Msg) {
  element(
    "build-code-editor",
    [
      attribute.class("editor"),
      attribute.attribute("path", path),
      attribute.attribute("value", content),
      event.on("change", {
        use value <- decode.field("detail", decode.string)
        decode.success(msg.Project(project.FileApplied(path, value)))
      }),
    ],
    [],
  )
}
