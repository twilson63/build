import build/pure/preview_inspector.{type SelectedPreviewElement}
import gleam/option.{type Option}

pub type InspectorMessage {
  BuildInspectorEnable
  BuildInspectorDisable
}

pub type State {
  State(
    preview_url: String,
    selecting_element: Bool,
    selected_element: Option(SelectedPreviewElement),
    element_comment: String,
  )
}

pub type Msg {
  PreviewUrlChanged(String)
  ElementSelectToggled
  ElementSelected(SelectedPreviewElement)
  ElementCommentChanged(comment: String)
  ElementCleared
}

pub type Effect {
  PostInspectorMessage(InspectorMessage)
}

pub fn init() -> State {
  State(
    preview_url: "",
    selecting_element: False,
    selected_element: option.None,
    element_comment: "",
  )
}

pub fn update(state: State, msg: Msg) -> #(State, List(Effect)) {
  case msg {
    PreviewUrlChanged(url) -> #(
      State(..state, preview_url: url),
      case state.selecting_element {
        True -> [PostInspectorMessage(BuildInspectorEnable)]
        False -> []
      },
    )
    ElementSelectToggled -> {
      let selecting = !state.selecting_element
      #(State(..state, selecting_element: selecting), [
        PostInspectorMessage(case selecting {
          True -> BuildInspectorEnable
          False -> BuildInspectorDisable
        }),
      ])
    }
    ElementSelected(element) -> #(
      State(
        ..state,
        selected_element: option.Some(element),
        element_comment: "",
        selecting_element: False,
      ),
      [PostInspectorMessage(BuildInspectorDisable)],
    )
    ElementCommentChanged(comment) -> #(
      State(..state, element_comment: comment),
      [],
    )
    ElementCleared -> #(
      State(..state, selected_element: option.None, element_comment: ""),
      [],
    )
  }
}
