import type { paths } from '@genvr/api-client';

export type Experience =
  paths['/v1/experiences/{id}']['get']['responses'][200]['content']['application/json'];
export type PublishBody = NonNullable<
  paths['/v1/experiences/{id}/publish']['post']['requestBody']
>['content']['application/json'];
