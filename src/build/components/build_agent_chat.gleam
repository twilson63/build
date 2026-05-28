import build/actors/chat
import build/msg
import gleam/dynamic/decode
import gleam/int
import gleam/list
import lustre/attribute
import lustre/element.{type Element, fragment}
import lustre/element/html
import lustre/event

pub fn view(
  messages: List(chat.Message),
  prompt: String,
  running: Bool,
  busy: Bool,
) -> Element(msg.Msg) {
  fragment([
    html.div([attribute.class("chatTools")], [
      html.span([], [
        html.text(int.to_string(list.length(messages)) <> " messages"),
      ]),
      button(
        [
          attribute.class("ghost compact"),
          attribute.disabled(messages == [] || busy),
          event.on_click(msg.Chat(chat.ChatCleared)),
        ],
        "Clear chat",
      ),
    ]),
    html.div([attribute.class("messages")], case messages {
      [] -> [
        html.p([attribute.class("empty")], [
          html.text(
            "Try: “Turn this into a CRM with contacts and notes using PGlite.”",
          ),
        ]),
      ]
      _ -> list.index_map(messages, message_view)
    }),
    html.textarea(
      [
        attribute.placeholder("Describe the app change you want..."),
        event.on_input(fn(value) { msg.Chat(chat.PromptChanged(value)) }),
        event.on("keydown", submit_shortcut_decoder()),
      ],
      prompt,
    ),
    case running {
      True ->
        html.div([attribute.class("thinking")], [
          html.text("Model is thinking…"),
        ])
      False -> html.text("")
    },
    html.div([attribute.class("actions")], [
      button(
        [
          attribute.disabled(busy),
          event.on_click(msg.SubmitPrompt("gleam-request", 0)),
        ],
        case busy {
          True -> "Working..."
          False -> "Send"
        },
      ),
      case running {
        True ->
          button(
            [attribute.class("secondary"), event.on_click(msg.CancelAgent)],
            "Cancel",
          )
        False -> html.text("")
      },
      button(
        [
          attribute.class("secondary iconButton"),
          attribute.title("Export ZIP"),
          attribute.aria_label("Export ZIP"),
          event.on_click(msg.ExportZip),
        ],
        "⬇️",
      ),
      button(
        [
          attribute.class("secondary iconButton"),
          attribute.title("Reset to default app"),
          attribute.aria_label("Reset to default app"),
          event.on_click(msg.ResetProject),
        ],
        "↺",
      ),
    ]),
  ])
}

fn submit_shortcut_decoder() {
  use key <- decode.field("key", decode.string)
  use ctrl <- decode.field("ctrlKey", decode.bool)
  use meta <- decode.field("metaKey", decode.bool)
  case key == "Enter" && { ctrl || meta } {
    True -> decode.success(msg.SubmitPrompt("gleam-request", 0))
    False -> decode.success(msg.NoOp)
  }
}

fn message_view(message: chat.Message, index: Int) -> Element(msg.Msg) {
  let role_class = case message.role {
    chat.User -> "msg user"
    chat.Assistant -> "msg assistant"
  }
  html.button(
    [
      attribute.type_("button"),
      attribute.class(role_class),
      event.on_click(msg.Chat(chat.MessageToggled(index))),
    ],
    [html.text(message.content)],
  )
}

fn button(attrs, label: String) {
  html.button([attribute.type_("button"), ..attrs], [html.text(label)])
}
