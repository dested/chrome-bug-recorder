import { Composition } from 'remotion'
import { Promo, PROMO_DUR } from './Promo'

export const Root = () => {
  return (
    <Composition
      id="promo"
      component={Promo}
      durationInFrames={PROMO_DUR}
      fps={30}
      width={1920}
      height={1080}
    />
  )
}
