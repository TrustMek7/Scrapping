export interface FacebookPostImage {
  url: string;
  alt: string | null;
  width: number;
  height: number;
}

export interface FacebookPost {
  url: string;
  author: {
    name: string | null;
  };
  text: string | null;
  images: FacebookPostImage[];
  capturedAt: string;
}
