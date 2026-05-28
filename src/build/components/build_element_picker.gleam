import build/actors/preview
import build/msg
import build/pure/preview_inspector
import gleam/option.{type Option, None, Some}
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event

pub fn view(element: Option(preview_inspector.SelectedPreviewElement), comment: String, busy: Bool) -> Element(msg.Msg) {
  case element {
    None -> html.text("")
    Some(selected) ->
      html.section(
        [attribute.class("selectedElementPanel")],
        [
          html.div([], [
            html.small([], [html.text("Selected element")]),
            html.strong([], [html.text(preview_inspector.summarize_selected_element(selected))]),
            html.p([], [html.text(selected.text_content)]),
          ]),
          html.textarea(
            [
              attribute.placeholder("Comment on how this element should improve..."),
              event.on_input(fn(value) { msg.Preview(preview.ElementCommentChanged(value)) }),
            ],
            comment,
          ),
          html.div([attribute.class("actions")], [
            button([
              attribute.class("secondary compact"),
              attribute.disabled(busy || comment == ""),
              event.on_click(msg.ImproveSelectedElement("gleam-improve", 0)),
            ], "Improve selected"),
            button([attribute.class("ghost compact"), event.on_click(msg.Preview(preview.ElementCleared))], "Clear"),
          ]),
        ],
      )
  }
}

fn button(attrs, label: String) {
  html.button([attribute.type_("button"), ..attrs], [html.text(label)])
}
