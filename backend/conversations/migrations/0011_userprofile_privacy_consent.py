from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("conversations", "0010_capturerequest_image_hash_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="privacy_consent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="privacy_consent_version",
            field=models.CharField(blank=True, max_length=50),
        ),
    ]
