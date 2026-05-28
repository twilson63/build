import build/actors/preview

pub fn interpret(effect: preview.Effect) -> Nil {
  case effect {
    preview.PostInspectorMessage(message) -> post_inspector_message(inspector_message_to_string(message))
  }
}

fn inspector_message_to_string(message: preview.InspectorMessage) -> String {
  case message {
    preview.BuildInspectorEnable -> "BUILD_INSPECTOR_ENABLE"
    preview.BuildInspectorDisable -> "BUILD_INSPECTOR_DISABLE"
  }
}

@external(javascript, "../../gleam-externals/dom.mjs", "postInspectorMessage")
fn post_inspector_message(message: String) -> Nil
