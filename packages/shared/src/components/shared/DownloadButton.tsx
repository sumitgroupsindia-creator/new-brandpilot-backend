import { Button, ButtonProps } from '../ui/Button';

interface DownloadButtonProps extends Omit<ButtonProps, 'loading'> {
  isDownloading?: boolean;
}

export function DownloadButton({ isDownloading = false, children, ...props }: DownloadButtonProps) {
  return (
    <Button loading={isDownloading} disabled={isDownloading || props.disabled} {...props}>
      {isDownloading ? 'Preparing export...' : children}
    </Button>
  );
}
