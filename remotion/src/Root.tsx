import React from "react";
import { Composition, Still } from "remotion";
import { HeroCore } from "./HeroCore";
import { AgentFlow } from "./AgentFlow";
import { OgImage } from "./OgImage";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="HeroCore" component={HeroCore} durationInFrames={360} fps={30} width={1280} height={1280} />
      <Composition id="AgentFlow" component={AgentFlow} durationInFrames={360} fps={30} width={1920} height={820} />
      <Still id="OgImage" component={OgImage} width={1200} height={630} />
    </>
  );
};
