import * as Schema from "effect/Schema";
import * as Option from "effect/Option";

const Coordinate = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 }));
const ObjectAvatarDefinition = Schema.Struct({
  version: Schema.Literal(1),
  id: Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9_-]{0,63}$/)),
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  body: Schema.Struct({
    path: Schema.String.check(
      Schema.isMaxLength(8_000),
      Schema.isPattern(/^[Mm][MmLlHhVvCcSsQqTtAaZz0-9,.eE+ \t\r\n-]+$/),
    ),
  }),
  eyes: Schema.Struct({
    x: Coordinate,
    y: Coordinate,
    spacing: Coordinate,
    scale: Schema.Number.check(Schema.isBetween({ minimum: 0.6, maximum: 1.8 })),
  }),
});
const decode = Schema.decodeUnknownOption(Schema.fromJsonString(ObjectAvatarDefinition));

export function decodeBotAvatarDefinition(json: string) {
  return json.length <= 16_384 ? Option.getOrUndefined(decode(json)) : undefined;
}
